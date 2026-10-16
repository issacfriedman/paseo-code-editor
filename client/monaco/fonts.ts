import { FONTS } from "../../shared/settings";
import { fetchDataUrl, type AssetRpc } from "./load";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;

const VARIANTS = [
  { file: "400-normal", weight: 400, style: "normal" },
  { file: "700-normal", weight: 700, style: "normal" },
  { file: "400-italic", weight: 400, style: "italic" },
] as const;
const loaded = new Map<string, Promise<void>>();

// Fonts ship inside the plugin, so they work offline and need no font CDN.
export function ensureFont(rpc: AssetRpc, font: string): Promise<void> {
  const entry = FONTS.find((f) => f.value === font);
  if (!entry || font === "system") return Promise.resolve();
  let pending = loaded.get(font);
  if (!pending) {
    const family = entry.label;
    pending = (async () => {
      const faces: string[] = [];
      for (const v of VARIANTS) {
        try {
          const url = await fetchDataUrl(rpc, `font:${font}-${v.file}.woff2`, "font/woff2");
          faces.push(
            `@font-face{font-family:'${family}';src:url(${url}) format('woff2');font-weight:${v.weight};font-style:${v.style};font-display:block}`,
          );
        } catch {
          // Some fonts have no italic; the browser fakes it.
        }
      }
      const style = document.createElement("style");
      style.setAttribute("data-paseo-code-editor", `font-${font}`);
      style.textContent = faces.join("\n");
      document.head.appendChild(style);
      await Promise.all([
        document.fonts.load(`400 13px '${family}'`),
        document.fonts.load(`700 13px '${family}'`),
      ]).catch(() => {});
    })();
    loaded.set(font, pending);
  }
  return pending;
}

export function fontFamily(font: string): string {
  const entry = FONTS.find((f) => f.value === font) ?? FONTS[0];
  return entry.value === "system" ? entry.css : `'${entry.label}', ui-monospace, Menlo, monospace`;
}
