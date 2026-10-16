// Web only. Monaco is not in the plugin bundle: the daemon serves it on first use, so phones never
// download it. Typed loosely on purpose; monaco-editor is a build-time dependency only.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const DecompressionStream: any;
declare const Blob: any;
declare const URL: any;
declare const Worker: any;
declare const Response: any;
declare const atob: (data: string) => string;
declare const TextDecoder: any;

export type Monaco = any;
export type AssetRpc = (input: { name: string; offset: number }) => Promise<{
  data: string;
  total: number;
  gzip: boolean;
}>;

async function fetchBase64(rpc: AssetRpc, name: string): Promise<{ data: string; gzip: boolean }> {
  let data = "";
  let gzip = false;
  for (;;) {
    const chunk = await rpc({ name, offset: data.length });
    data += chunk.data;
    gzip = chunk.gzip;
    if (data.length >= chunk.total || !chunk.data) break;
  }
  return { data, gzip };
}

function toBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function fetchText(rpc: AssetRpc, name: string): Promise<string> {
  const { data, gzip } = await fetchBase64(rpc, name);
  const bytes = toBytes(data);
  if (!gzip) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function fetchDataUrl(rpc: AssetRpc, name: string, mime: string): Promise<string> {
  const { data } = await fetchBase64(rpc, name);
  return `data:${mime};base64,${data}`;
}

let loading: Promise<Monaco> | null = null;

export function loadMonaco(rpc: AssetRpc): Promise<Monaco> {
  if (!loading) {
    loading = (async () => {
      const [js, css, worker] = await Promise.all([
        fetchText(rpc, "monaco.js"),
        fetchText(rpc, "monaco.css"),
        fetchText(rpc, "editor.worker.js"),
      ]);
      const style = document.createElement("style");
      style.setAttribute("data-paseo-code-editor", "monaco");
      style.textContent = css;
      document.head.appendChild(style);
      const workerUrl = URL.createObjectURL(new Blob([worker], { type: "text/javascript" }));
      (globalThis as any).MonacoEnvironment = { getWorker: () => new Worker(workerUrl) };
      // eslint-disable-next-line no-new-func
      return new Function(`${js}\nreturn PaseoMonaco;`)();
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
