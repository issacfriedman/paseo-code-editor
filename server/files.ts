/// <reference types="node" />
import { execFile } from "node:child_process";
import { readdir, readFile as fsReadFile, rename, stat, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import type { listDir, listFiles, readFile, statFile, workspaceRootRpc, writeFile } from "../shared/contracts";
import { resolveInside, workspaceRoot } from "./workspaces";

const run = promisify(execFile);
const MAX_FILES = 20_000;
const MAX_EDIT_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".turbo", ".venv", "venv", "__pycache__", "DerivedData", "Pods"]);

export async function handleList(
  { workspaceId }: RpcInput<typeof listFiles>,
  { paseo }: PluginHandlerContext,
) {
  const root = await workspaceRoot(paseo, workspaceId);
  let files = await gitFiles(root);
  if (!files) files = await walk(root);
  files.sort();
  const truncated = files.length > MAX_FILES;
  return { root, files: files.slice(0, MAX_FILES), truncated };
}

async function gitFiles(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await run(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    return [...new Set(stdout.split("\0").filter(Boolean))];
  } catch {
    return null;
  }
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [""];
  while (queue.length && out.length <= MAX_FILES) {
    const dir = queue.shift()!;
    const entries = await readdir(path.join(root, dir), { withFileTypes: true }).catch(() => null);
    if (!entries) continue;
    for (const entry of entries) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(rel);
      } else if (entry.isFile()) out.push(rel);
    }
  }
  return out;
}

export async function handleRoot(
  { workspaceId }: RpcInput<typeof workspaceRootRpc>,
  { paseo }: PluginHandlerContext,
) {
  return { root: await workspaceRoot(paseo, workspaceId) };
}

const HIDDEN = new Set([".git", ".DS_Store"]);

export async function handleDir(
  { workspaceId, path: rel }: RpcInput<typeof listDir>,
  { paseo }: PluginHandlerContext,
) {
  const root = await workspaceRoot(paseo, workspaceId);
  const dir = rel ? await resolveInside(root, rel) : root;
  const entries = await readdir(dir, { withFileTypes: true });
  const out: { name: string; dir: boolean }[] = [];
  for (const entry of entries) {
    if (HIDDEN.has(entry.name)) continue;
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      isDir = await stat(path.join(dir, entry.name)).then((s) => s.isDirectory(), () => false);
    }
    out.push({ name: entry.name, dir: isDir });
  }
  // Folders first, then names, like the Files tab.
  out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { entries: out };
}

export async function handleRead(
  { workspaceId, path: rel }: RpcInput<typeof readFile>,
  { paseo }: PluginHandlerContext,
) {
  const root = await workspaceRoot(paseo, workspaceId);
  const file = await resolveInside(root, rel);
  const info = await stat(file);
  if (info.size > MAX_EDIT_BYTES) {
    return { content: "", mtimeMs: info.mtimeMs, size: info.size, tooLarge: true, binary: false };
  }
  const buffer = await fsReadFile(file);
  // A NUL byte in the first 8 KB is the usual sign of a binary file.
  const binary = buffer.subarray(0, 8192).includes(0);
  return {
    content: binary ? "" : buffer.toString("utf8"),
    mtimeMs: info.mtimeMs,
    size: info.size,
    tooLarge: false,
    binary,
  };
}

export async function handleStat(
  { workspaceId, path: rel }: RpcInput<typeof statFile>,
  { paseo }: PluginHandlerContext,
) {
  const root = await workspaceRoot(paseo, workspaceId);
  const file = await resolveInside(root, rel);
  const info = await stat(file).catch(() => null);
  return { exists: Boolean(info), mtimeMs: info?.mtimeMs ?? 0 };
}

export async function handleWrite(
  { workspaceId, path: rel, content, expectedMtimeMs, force }: RpcInput<typeof writeFile>,
  { paseo }: PluginHandlerContext,
) {
  const root = await workspaceRoot(paseo, workspaceId);
  const file = await resolveInside(root, rel);
  const current = await stat(file).catch(() => null);
  if (!force && current && expectedMtimeMs !== null && current.mtimeMs !== expectedMtimeMs) {
    return { ok: false, conflict: true, mtimeMs: current.mtimeMs };
  }
  // Write to a temp file and rename, so a crash never leaves a half-written file.
  const temp = `${file}.paseo-editor-${process.pid}-${Date.now()}.tmp`;
  await fsWriteFile(temp, content, { encoding: "utf8", mode: current ? current.mode : 0o644 });
  await rename(temp, file);
  const saved = await stat(file);
  return { ok: true, conflict: false, mtimeMs: saved.mtimeMs };
}
