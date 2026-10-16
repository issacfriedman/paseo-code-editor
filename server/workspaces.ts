/// <reference types="node" />
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";

type Paseo = PluginHandlerContext["paseo"];

const cache = new Map<string, { root: string; at: number }>();
const CACHE_MS = 60_000;

// Files are only ever resolved inside a Paseo workspace directory that the daemon knows about.
export async function workspaceRoot(paseo: Paseo, workspaceId: string): Promise<string> {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.root;
  const handle = paseo.workspaces.ref(workspaceId);
  await handle.refresh();
  const directory = handle.directory;
  if (!directory) throw new Error("Workspace has no directory");
  const root = await realpath(directory);
  cache.set(workspaceId, { root, at: Date.now() });
  return root;
}

export async function resolveInside(root: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath)) throw new Error("Path must be relative to the workspace");
  const target = path.resolve(root, relativePath);
  assertInside(root, target);
  // Follow symlinks for existing files so a link cannot point outside the workspace.
  const real = await realpath(target).catch(() => null);
  if (real) assertInside(root, real);
  else assertInside(root, await realpath(path.dirname(target)));
  return target;
}

function assertInside(root: string, target: string) {
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path is outside the workspace");
  }
}
