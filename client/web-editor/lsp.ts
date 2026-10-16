import { LSPClient, LSPPlugin, Workspace, languageServerExtensions, type Transport, type WorkspaceFile } from "@codemirror/lsp-client";
import type { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { sanitizeHtml } from "./sanitize";

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

type Connection = {
  client: LSPClient;
  sessionId: string;
  rootUri: string;
  close(): void;
};

// Plain-JSON transport over plugin RPC: sends are batched, receives use a long poll.
function rpcTransport(rpc: LspRpc, sessionId: string, onEnd: (reason: string) => void) {
  let handlers: ((message: string) => void)[] = [];
  let outbox: string[] = [];
  let sending = Promise.resolve();
  let closed = false;

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

  const end = (reason: string) => {
    if (closed) return;
    closed = true;
    onEnd(reason);
  };

  void (async () => {
    let failures = 0;
    while (!closed) {
      try {
        const result = await rpc.poll({ sessionId, waitMs: 20_000 });
        failures = 0;
        for (const message of result.messages) for (const handler of handlers) handler(message);
        if (!result.alive) end(result.exitReason ?? "Language server stopped");
      } catch {
        failures += 1;
        if (failures >= 6) end("Lost connection to the language server");
        else await new Promise((resolve) => setTimeout(resolve, 1500 * failures));
      }
    }
  })();

  const transport: Transport = {
    send(message) {
      if (closed) return;
      outbox.push(message);
      if (outbox.length === 1) queueMicrotask(flush);
    },
    subscribe(handler) {
      handlers.push(handler);
    },
    unsubscribe(handler) {
      handlers = handlers.filter((h) => h !== handler);
    },
  };
  return {
    transport,
    close() {
      closed = true;
    },
  };
}

class EditorFile implements WorkspaceFile {
  constructor(
    readonly uri: string,
    readonly languageId: string,
    public version: number,
    public doc: Text,
    readonly view: EditorView,
  ) {}
  getView() {
    return this.view;
  }
}

// Like the default workspace, plus jump-to-definition can open another file in the panel.
class PanelWorkspace extends Workspace {
  files: EditorFile[] = [];
  private versions: Record<string, number> = Object.create(null);

  constructor(
    client: LSPClient,
    private readonly hub: LspHub,
  ) {
    super(client);
  }

  private nextVersion(uri: string) {
    return (this.versions[uri] = (this.versions[uri] ?? -1) + 1);
  }

  syncFiles() {
    const result = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        result.push({ changes, file, prevDoc: file.doc });
        file.doc = file.view.state.doc;
        file.version = this.nextVersion(file.uri);
        plugin.clear();
      }
    }
    return result;
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    if (this.getFile(uri)) return;
    const file = new EditorFile(uri, languageId, this.nextVersion(uri), view.state.doc, view);
    this.files.push(file);
    this.client.didOpen(file);
  }

  closeFile(uri: string) {
    const file = this.getFile(uri);
    if (!file) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(uri);
  }

  displayFile(uri: string) {
    return this.hub.displayFile(uri);
  }
}

export class LspHub {
  private connections = new Map<string, Promise<Connection | null>>();
  private views = new Map<string, EditorView>();
  private viewWaiters = new Map<string, (view: EditorView) => void>();

  constructor(
    private readonly rpc: LspRpc,
    private readonly workspaceId: string,
    private readonly clientId: string,
    private readonly onStatus: (serverId: string, status: LspStatus) => void,
    // Opens an absolute file path in the panel. Returns false when the panel cannot show it.
    private readonly openPath: (absolutePath: string) => boolean,
  ) {}

  connect(serverId: string): Promise<Connection | null> {
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
      this.onStatus(serverId, { state: "unavailable", serverName: serverId, reason: String(error) });
      this.connections.delete(serverId);
      return null;
    }
    if (!started.available || !started.sessionId || !started.rootUri) {
      this.onStatus(serverId, {
        state: "unavailable",
        serverName: started.serverName,
        reason: started.reason ?? "Not available",
      });
      return null;
    }
    const { serverName, sessionId, rootUri } = started;
    const { transport, close } = rpcTransport(this.rpc, sessionId, (reason) => {
      this.connections.delete(serverId);
      this.onStatus(serverId, { state: "stopped", serverName, reason });
    });
    const client = new LSPClient({
      rootUri,
      initializationOptions: started.initializationOptions ?? undefined,
      // Requests cross the relay, so allow more than the 3 s default.
      timeout: 15_000,
      sanitizeHTML: sanitizeHtml,
      extensions: languageServerExtensions(),
      workspace: (c) => new PanelWorkspace(c, this),
    }).connect(transport);
    client.initializing.then(
      () => this.onStatus(serverId, { state: "ready", serverName }),
      (error: unknown) =>
        this.onStatus(serverId, { state: "stopped", serverName, reason: `Could not start: ${String(error)}` }),
    );
    return {
      client,
      sessionId,
      rootUri,
      close: () => {
        close();
        client.disconnect();
        void this.rpc.stop({ sessionId }).catch(() => {});
      },
    };
  }

  // Views are keyed by absolute path, because servers and editors can encode the same URI differently.
  registerView(absolutePath: string, view: EditorView) {
    this.views.set(absolutePath, view);
    this.viewWaiters.get(absolutePath)?.(view);
    this.viewWaiters.delete(absolutePath);
  }

  unregisterView(absolutePath: string, view: EditorView) {
    if (this.views.get(absolutePath) === view) this.views.delete(absolutePath);
  }

  async displayFile(uri: string): Promise<EditorView | null> {
    const absolutePath = uriToPath(uri);
    if (!absolutePath || !this.openPath(absolutePath)) return null;
    const open = this.views.get(absolutePath);
    if (open) return open;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.viewWaiters.delete(absolutePath);
        resolve(null);
      }, 8000);
      this.viewWaiters.set(absolutePath, (view) => {
        clearTimeout(timer);
        resolve(view);
      });
    });
  }

  dispose() {
    for (const pending of this.connections.values()) void pending.then((c) => c?.close());
    this.connections.clear();
  }
}

export function uriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    return decodeURIComponent(uri.slice("file://".length).replace(/^localhost/, ""));
  } catch {
    return null;
  }
}

export function pathToUri(absolutePath: string): string {
  return "file://" + absolutePath.split("/").map(encodeURIComponent).join("/");
}
