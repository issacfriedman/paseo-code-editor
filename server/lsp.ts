/// <reference types="node" />
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import type { pollLsp, sendLsp, startLsp, stopLsp } from "../shared/contracts";
import type { ServerId } from "../shared/languages";
import { workspaceRoot } from "./workspaces";

const PLUGIN_ID = "code-editor";
const IDLE_KILL_MS = 90_000;

type Launch = {
  name: string;
  command: string;
  args: string[];
  initializationOptions?: unknown;
};

type Session = {
  id: string;
  key: string;
  serverName: string;
  proc: ChildProcessWithoutNullStreams;
  queue: string[];
  waiters: Set<() => void>;
  lastSeen: number;
  alive: boolean;
  exitReason: string | null;
  stderrTail: string;
};

const sessions = new Map<string, Session>();
const sessionsByKey = new Map<string, Session>();

// The plugin subprocess runs in the daemon's cwd, so find our own directory from the daemon config.
let pluginDirCache: string | null | undefined;
export function pluginDir(): string | null {
  if (pluginDirCache !== undefined) return pluginDirCache;
  const home = process.env.PASEO_HOME ?? path.join(os.homedir(), ".paseo");
  const candidates: string[] = [];
  try {
    const config = JSON.parse(readFileSync(path.join(home, "config.json"), "utf8"));
    for (const [id, entry] of Object.entries<{ path?: string }>(config.plugins ?? {})) {
      if (entry?.path && (id === PLUGIN_ID || id.startsWith(`${PLUGIN_ID}`))) candidates.push(entry.path);
    }
  } catch {
    // Fall through to the conventional location.
  }
  candidates.push(path.join(os.homedir(), "paseo-plugins", PLUGIN_ID));
  pluginDirCache =
    candidates.find((dir) => existsSync(path.join(dir, "node_modules", "typescript-language-server"))) ??
    null;
  return pluginDirCache;
}

const EXTRA_PATH = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(os.homedir(), "go", "bin"),
  path.join(os.homedir(), ".cargo", "bin"),
  "/usr/bin",
];

function findBinary(name: string): string | null {
  const dirs = [...(process.env.PATH ?? "").split(path.delimiter), ...EXTRA_PATH];
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function nodeLaunch(name: string, script: string, args: string[], initializationOptions?: unknown): Launch | string {
  if (!existsSync(script)) return `${name} is not installed in the plugin folder`;
  return { name, command: process.execPath, args: [script, ...args], initializationOptions };
}

function launchFor(serverId: ServerId): Launch | string {
  const dir = pluginDir();
  const modules = dir ? path.join(dir, "node_modules") : null;
  const extracted = modules ? path.join(modules, "vscode-langservers-extracted", "bin") : "";
  switch (serverId) {
    case "typescript":
      if (!modules) return "Plugin folder not found";
      return nodeLaunch(
        "TypeScript",
        path.join(modules, "typescript-language-server", "lib", "cli.mjs"),
        ["--stdio"],
        {
          // The project's own TypeScript wins; the bundled copy is the fallback.
          tsserver: { fallbackPath: path.join(modules, "typescript", "lib") },
          // Gives .vue files TypeScript errors, completion, and go to definition through tsserver.
          plugins: [{ name: "@vue/typescript-plugin", location: dir, languages: ["vue"] }],
        },
      );
    case "python":
      if (!modules) return "Plugin folder not found";
      return nodeLaunch("Pyright", path.join(modules, "pyright", "langserver.index.js"), ["--stdio"]);
    case "json":
      return nodeLaunch("JSON", path.join(extracted, "vscode-json-language-server"), ["--stdio"], {
        provideFormatter: true,
      });
    case "css":
      return nodeLaunch("CSS", path.join(extracted, "vscode-css-language-server"), ["--stdio"], {
        provideFormatter: true,
      });
    case "html":
      return nodeLaunch("HTML", path.join(extracted, "vscode-html-language-server"), ["--stdio"], {
        provideFormatter: true,
      });
    case "swift": {
      const bin = findBinary("sourcekit-lsp");
      return bin ? { name: "SourceKit-LSP", command: bin, args: [] } : "sourcekit-lsp is not installed (install Xcode)";
    }
    case "go": {
      const bin = findBinary("gopls");
      return bin ? { name: "gopls", command: bin, args: [] } : "gopls is not installed (go install golang.org/x/tools/gopls@latest)";
    }
    case "rust": {
      const bin = findBinary("rust-analyzer");
      return bin ? { name: "rust-analyzer", command: bin, args: [] } : "rust-analyzer is not installed (rustup component add rust-analyzer)";
    }
  }
}

const SERVER_IDS = new Set<string>(["typescript", "python", "json", "css", "html", "swift", "go", "rust"]);

export async function handleStart(
  { workspaceId, clientId, serverId }: RpcInput<typeof startLsp>,
  { paseo }: PluginHandlerContext,
) {
  const unavailable = (serverName: string, reason: string) => ({
    available: false,
    sessionId: null,
    serverName,
    reason,
    rootUri: null,
    initializationOptions: null,
  });
  if (!SERVER_IDS.has(serverId)) return unavailable(serverId, "No language server for this file type");
  const root = await workspaceRoot(paseo, workspaceId);
  const launch = launchFor(serverId as ServerId);
  if (typeof launch === "string") return unavailable(serverId, launch);
  const rootUri = pathToFileURL(root).href;

  // One server process per editor client, workspace, and language, because an LSP server
  // expects exactly one client to initialize it.
  const key = `${clientId}\0${root}\0${serverId}`;
  const existing = sessionsByKey.get(key);
  if (existing?.alive) {
    existing.lastSeen = Date.now();
    return {
      available: true,
      sessionId: existing.id,
      serverName: existing.serverName,
      reason: null,
      rootUri,
      initializationOptions: launch.initializationOptions ?? null,
    };
  }

  const proc = spawn(launch.command, launch.args, {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PATH: [process.env.PATH ?? "", ...EXTRA_PATH].join(path.delimiter),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const session: Session = {
    id: randomUUID(),
    key,
    serverName: launch.name,
    proc,
    queue: [],
    waiters: new Set(),
    lastSeen: Date.now(),
    alive: true,
    exitReason: null,
    stderrTail: "",
  };
  sessions.set(session.id, session);
  sessionsByKey.set(key, session);
  attachReader(session);
  proc.stderr.on("data", (chunk: Buffer) => {
    session.stderrTail = (session.stderrTail + chunk.toString("utf8")).slice(-2000);
  });
  proc.on("error", (error) => endSession(session, `Could not start ${launch.name}: ${error.message}`));
  proc.on("exit", (code, signal) => {
    const tail = session.stderrTail.trim().split("\n").slice(-3).join("\n");
    endSession(session, `${launch.name} stopped (${signal ?? `code ${code}`})${tail ? `: ${tail}` : ""}`);
  });
  console.log(`[code-editor] started ${launch.name} for ${root}`);
  return {
    available: true,
    sessionId: session.id,
    serverName: launch.name,
    reason: null,
    rootUri,
    initializationOptions: launch.initializationOptions ?? null,
  };
}

function attachReader(session: Session) {
  let buffer = Buffer.alloc(0);
  session.proc.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Not a valid frame; drop the header and resync.
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      session.queue.push(buffer.subarray(start, start + length).toString("utf8"));
      buffer = buffer.subarray(start + length);
      wake(session);
    }
  });
}

function wake(session: Session) {
  // A short delay batches a burst of server messages into one poll response.
  setTimeout(() => {
    for (const waiter of [...session.waiters]) waiter();
  }, 5);
}

function endSession(session: Session, reason: string) {
  if (!session.alive) return;
  session.alive = false;
  session.exitReason = reason;
  sessionsByKey.delete(session.key);
  console.log(`[code-editor] ${reason}`);
  wake(session);
  // Keep the record briefly so a pending poll can read the exit reason.
  setTimeout(() => sessions.delete(session.id), 30_000);
}

export function handleSend({ sessionId, messages }: RpcInput<typeof sendLsp>) {
  const session = sessions.get(sessionId);
  if (!session?.alive) return { alive: false };
  session.lastSeen = Date.now();
  for (const message of messages) {
    session.proc.stdin.write(`Content-Length: ${Buffer.byteLength(message, "utf8")}\r\n\r\n${message}`);
  }
  return { alive: true };
}

export async function handlePoll({ sessionId, waitMs }: RpcInput<typeof pollLsp>) {
  const session = sessions.get(sessionId);
  if (!session) return { messages: [], alive: false, exitReason: "Language server session ended" };
  session.lastSeen = Date.now();
  if (!session.queue.length && session.alive) {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        session.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      session.waiters.add(done);
    });
  }
  session.lastSeen = Date.now();
  return { messages: session.queue.splice(0), alive: session.alive, exitReason: session.exitReason };
}

export function handleStop({ sessionId }: RpcInput<typeof stopLsp>) {
  const session = sessions.get(sessionId);
  if (session) killSession(session, "Closed by the editor");
  return {};
}

function killSession(session: Session, reason: string) {
  endSession(session, reason);
  if (!session.proc.killed) session.proc.kill();
}

export function startReaper(): () => void {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (session.alive && now - session.lastSeen > IDLE_KILL_MS) killSession(session, "Idle editor closed");
    }
  }, 30_000);
  return () => {
    clearInterval(timer);
    for (const session of sessions.values()) killSession(session, "Plugin stopped");
  };
}
