import type { Monaco } from "./load";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type LspRpc = {
  start(input: { workspaceId: string; clientId: string; serverId: string }): Promise<{
    available: boolean;
    sessionId: string | null;
    serverName: string;
    reason: string | null;
    rootUri: string | null;
    initializationOptions?: unknown;
  }>;
  send(input: { sessionId: string; messages: string[] }): Promise<{ alive: boolean }>;
  poll(input: { sessionId: string; waitMs: number }): Promise<{
    messages: string[];
    alive: boolean;
    exitReason: string | null;
  }>;
  stop(input: { sessionId: string }): Promise<unknown>;
};

export type LspStatus =
  | { state: "starting"; serverName: string }
  | { state: "ready"; serverName: string }
  | { state: "unavailable"; serverName: string; reason: string }
  | { state: "stopped"; serverName: string; reason: string };

type Owned = { uri: string; languageId: string };

// Monaco keys models by the decoded, lowercased URI. Match that everywhere.
export function uriKey(uri: string): string {
  try {
    return decodeURIComponent(uri).toLowerCase();
  } catch {
    return uri.toLowerCase();
  }
}

function decodeUris(value: any): any {
  if (Array.isArray(value)) return value.map(decodeUris);
  if (!value || typeof value !== "object") return value;
  const out: any = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] =
      (key === "uri" || key === "targetUri") && typeof item === "string" && item.startsWith("file://")
        ? safeDecode(item)
        : decodeUris(item);
  }
  return out;
}

function safeDecode(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

// Monaco's LSP client talks to every open model and lowercases URIs. This transport keeps each
// server to the files it owns, restores the real URI and languageId, and fills in the root and
// initialization options that the client leaves empty.
function createTransport(options: {
  rpc: LspRpc;
  sessionId: string;
  rootUri: string;
  initializationOptions: unknown;
  owned: Map<string, Owned>;
  onReady(): void;
  onEnd(reason: string): void;
}) {
  const { rpc, sessionId, owned } = options;
  let listener: ((message: any) => void) | undefined;
  const early: any[] = [];
  let outbox: string[] = [];
  let sending = Promise.resolve();
  let closed = false;
  let initializeId: unknown;
  const stateListeners = new Set<(value: any) => void>();
  let state: any = { state: "open" };

  const deliver = (message: any) => {
    if (listener) listener(message);
    else early.push(message);
  };

  const end = (reason: string) => {
    if (closed) return;
    closed = true;
    state = { state: "closed", error: undefined };
    for (const l of stateListeners) l(state);
    options.onEnd(reason);
  };

  const flush = () => {
    if (!outbox.length) return;
    const messages = outbox;
    outbox = [];
    sending = sending
      .then(() => rpc.send({ sessionId, messages }))
      .then((result) => {
        if (!result.alive) end("Language server stopped");
      })
      .catch(() => {});
  };

  void (async () => {
    let failures = 0;
    while (!closed) {
      try {
        const result = await rpc.poll({ sessionId, waitMs: 20_000 });
        failures = 0;
        for (const raw of result.messages) {
          const message = decodeUris(JSON.parse(raw));
          if (initializeId !== undefined && message.id === initializeId && !message.method) options.onReady();
          // Monaco's client has no handler for "…/refresh" requests and answers with an error,
          // which makes Pyright exit. Acknowledge them here; Monaco re-pulls on its own schedule.
          if (message.id !== undefined && typeof message.method === "string" && message.method.endsWith("/refresh")) {
            outbox.push(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: null }));
            if (outbox.length === 1) queueMicrotask(flush);
            continue;
          }
          deliver(message);
        }
        if (!result.alive) end(result.exitReason ?? "Language server stopped");
      } catch {
        failures += 1;
        if (failures >= 6) end("Lost connection to the language server");
        else await new Promise((resolve) => setTimeout(resolve, 1500 * failures));
      }
    }
  })();

  const rewrite = (message: any): any | null => {
    const params = message.params;
    if (message.method === "initialize") {
      initializeId = message.id;
      return {
        ...message,
        params: {
          ...params,
          rootUri: options.rootUri,
          workspaceFolders: [{ uri: options.rootUri, name: options.rootUri.split("/").pop() }],
          initializationOptions: options.initializationOptions ?? undefined,
        },
      };
    }
    const doc = params?.textDocument;
    if (doc && typeof doc.uri === "string") {
      const entry = owned.get(uriKey(doc.uri));
      if (!entry) return null;
      const textDocument = { ...doc, uri: entry.uri };
      if (message.method === "textDocument/didOpen") textDocument.languageId = entry.languageId;
      return { ...message, params: { ...params, textDocument } };
    }
    return message;
  };

  return {
    transport: {
      get state() {
        return {
          get value() {
            return state;
          },
          get onChange() {
            return (l: (value: any) => void) => {
              stateListeners.add(l);
              return { dispose: () => stateListeners.delete(l) };
            };
          },
        };
      },
      async send(message: any) {
        const out = closed ? null : rewrite(message);
        if (!out) {
          // Not this server's file, or the server is gone: answer requests so nothing waits.
          if (message.id !== undefined && message.method) {
            queueMicrotask(() => deliver({ jsonrpc: "2.0", id: message.id, result: null }));
          }
          return;
        }
        outbox.push(JSON.stringify(out));
        if (outbox.length === 1) queueMicrotask(flush);
      },
      setListener(next: ((message: any) => void) | undefined) {
        listener = next;
        if (next) for (const message of early.splice(0)) next(message);
      },
      toString: () => `paseo-lsp:${sessionId}`,
    },
    close() {
      end("Closed");
    },
  };
}

type Connection = { close(): void };

export class LspHub {
  private connections = new Map<string, Promise<Connection | null>>();
  private owned = new Map<string, Map<string, Owned>>();

  constructor(
    private readonly monaco: Monaco,
    private readonly rpc: LspRpc,
    private readonly workspaceId: string,
    private readonly clientId: string,
    private readonly onStatus: (serverId: string, status: LspStatus) => void,
  ) {}

  // Call before creating the model, so the server sees the file open.
  own(serverId: string, uri: string, languageId: string) {
    let files = this.owned.get(serverId);
    if (!files) this.owned.set(serverId, (files = new Map()));
    files.set(uriKey(uri), { uri, languageId });
    void this.connect(serverId);
  }

  disown(serverId: string, uri: string) {
    this.owned.get(serverId)?.delete(uriKey(uri));
  }

  private connect(serverId: string): Promise<Connection | null> {
    let pending = this.connections.get(serverId);
    if (!pending) {
      pending = this.start(serverId);
      this.connections.set(serverId, pending);
    }
    return pending;
  }

  private async start(serverId: string): Promise<Connection | null> {
    this.onStatus(serverId, { state: "starting", serverName: serverId });
    let started;
    try {
      started = await this.rpc.start({ workspaceId: this.workspaceId, clientId: this.clientId, serverId });
    } catch (error) {
      this.connections.delete(serverId);
      this.onStatus(serverId, { state: "unavailable", serverName: serverId, reason: String(error) });
      return null;
    }
    if (!started.available || !started.sessionId || !started.rootUri) {
      this.onStatus(serverId, { state: "unavailable", serverName: started.serverName, reason: started.reason ?? "Not available" });
      return null;
    }
    const { serverName, sessionId, rootUri } = started;
    let owned = this.owned.get(serverId);
    if (!owned) this.owned.set(serverId, (owned = new Map()));
    const { transport, close } = createTransport({
      rpc: this.rpc,
      sessionId,
      rootUri,
      initializationOptions: started.initializationOptions,
      owned,
      onReady: () => this.onStatus(serverId, { state: "ready", serverName }),
      onEnd: (reason) => {
        this.connections.delete(serverId);
        this.onStatus(serverId, { state: "stopped", serverName, reason });
      },
    });
    new this.monaco.lsp.MonacoLspClient(transport);
    return {
      close: () => {
        close();
        void this.rpc.stop({ sessionId }).catch(() => {});
      },
    };
  }

  dispose() {
    for (const pending of this.connections.values()) void pending.then((c) => c?.close());
    this.connections.clear();
  }
}

export function pathToUri(absolutePath: string): string {
  return "file://" + absolutePath.split("/").map(encodeURIComponent).join("/");
}

export function uriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    return decodeURIComponent(uri.slice("file://".length).replace(/^localhost/, ""));
  } catch {
    return null;
  }
}
