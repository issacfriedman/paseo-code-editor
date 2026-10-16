import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listFiles = defineRpc({
  name: "files.list",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ root: z.string(), files: z.array(z.string()), truncated: z.boolean() }),
});

export const workspaceRootRpc = defineRpc({
  name: "workspace.root",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ root: z.string() }),
});

export const listDir = defineRpc({
  name: "files.dir",
  input: z.object({ workspaceId: z.string(), path: z.string() }),
  output: z.object({
    entries: z.array(z.object({ name: z.string(), dir: z.boolean() })),
  }),
});

export const readFile = defineRpc({
  name: "files.read",
  input: z.object({ workspaceId: z.string(), path: z.string() }),
  output: z.object({
    content: z.string(),
    mtimeMs: z.number(),
    size: z.number(),
    tooLarge: z.boolean(),
    binary: z.boolean(),
  }),
});

export const statFile = defineRpc({
  name: "files.stat",
  input: z.object({ workspaceId: z.string(), path: z.string() }),
  output: z.object({ exists: z.boolean(), mtimeMs: z.number() }),
});

export const writeFile = defineRpc({
  name: "files.write",
  input: z.object({
    workspaceId: z.string(),
    path: z.string(),
    content: z.string(),
    // The mtime the editor loaded. A different mtime on disk means someone else saved.
    expectedMtimeMs: z.number().nullable(),
    force: z.boolean(),
  }),
  output: z.object({ ok: z.boolean(), conflict: z.boolean(), mtimeMs: z.number() }),
});

export const startLsp = defineRpc({
  name: "lsp.start",
  input: z.object({ workspaceId: z.string(), clientId: z.string(), serverId: z.string() }),
  output: z.object({
    available: z.boolean(),
    sessionId: z.string().nullable(),
    serverName: z.string(),
    reason: z.string().nullable(),
    rootUri: z.string().nullable(),
    initializationOptions: z.unknown(),
  }),
});

export const sendLsp = defineRpc({
  name: "lsp.send",
  input: z.object({ sessionId: z.string(), messages: z.array(z.string()) }),
  output: z.object({ alive: z.boolean() }),
});

export const pollLsp = defineRpc({
  name: "lsp.poll",
  input: z.object({ sessionId: z.string(), waitMs: z.number().max(25_000) }),
  output: z.object({
    messages: z.array(z.string()),
    alive: z.boolean(),
    exitReason: z.string().nullable(),
  }),
});

export const stopLsp = defineRpc({
  name: "lsp.stop",
  input: z.object({ sessionId: z.string() }),
  output: z.object({}),
});
