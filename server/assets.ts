/// <reference types="node" />
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { RpcInput } from "@getpaseo/plugin";
import type { getAsset } from "../shared/contracts";
import { pluginDir } from "./lsp";

const CHUNK = 768 * 1024;
const cache = new Map<string, { data: string; gzip: boolean }>();

function assetPath(dir: string, name: string): { file: string; gzip: boolean } {
  if (name === "monaco.js" || name === "monaco.css" || name === "editor.worker.js") {
    return { file: path.join(dir, "assets", name), gzip: true };
  }
  const font = /^font:([a-z0-9-]+\.woff2)$/.exec(name);
  if (font) return { file: path.join(dir, "assets", "fonts", font[1]!), gzip: false };
  throw new Error(`Unknown asset ${name}`);
}

export async function handleAsset({ name, offset }: RpcInput<typeof getAsset>) {
  let entry = cache.get(name);
  if (!entry) {
    const dir = pluginDir();
    if (!dir) throw new Error("Plugin folder not found");
    const { file, gzip } = assetPath(dir, name);
    const bytes = await readFile(file);
    entry = { data: (gzip ? gzipSync(bytes, { level: 9 }) : bytes).toString("base64"), gzip };
    cache.set(name, entry);
  }
  return { data: entry.data.slice(offset, offset + CHUNK), total: entry.data.length, gzip: entry.gzip };
}
