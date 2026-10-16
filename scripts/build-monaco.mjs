// Builds assets/monaco.js, assets/monaco.css and assets/editor.worker.js.
// The daemon serves these to desktop and web clients on demand, so the phone bundle stays small.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vs = "monaco-editor/esm/vs";
// Syntax colors only. Language intelligence comes from the language servers, not Monaco's workers.
const LANGUAGES = new Set([
  "typescript", "javascript", "python", "html", "css", "scss", "less", "markdown", "yaml",
  "rust", "go", "java", "kotlin", "cpp", "objective-c", "sql", "xml", "swift", "shell",
  "ruby", "dockerfile", "ini", "graphql", "php", "csharp", "lua", "dart", "scala", "protobuf",
]);

const esm = `${root}/node_modules/monaco-editor/esm`;
const main = readFileSync(`${esm}/vs/editor/editor.main.js`, "utf8");
const lines = [];
for (const line of main.split("\n")) {
  if (line.includes("languages/features/") || line.includes("__src_languages_features_")) continue;
  const lang = /languages\/definitions\/([^/]+)\/register\.js/.exec(line);
  if (lang && !LANGUAGES.has(lang[1])) continue;
  lines.push(
    line
      // Absolute paths: the package's exports map blocks deep imports.
      .replace(/(['"])\.\.\/\.\.\/external\//g, `$1${esm}/external/`)
      .replace(/(['"])\.\.\//g, `$1${esm}/vs/`)
      .replace(/(['"])\.\//g, `$1${esm}/vs/editor/`),
  );
}
mkdirSync(`${root}/vendor-src/.gen`, { recursive: true });
const entry = `${root}/vendor-src/.gen/monaco-entry.js`;
writeFileSync(entry, lines.join("\n"));

rmSync(`${root}/vendor-src/.gen/out`, { recursive: true, force: true });
await build({
  entryPoints: { monaco: entry },
  bundle: true,
  format: "iife",
  globalName: "PaseoMonaco",
  minify: true,
  target: "es2020",
  outdir: `${root}/vendor-src/.gen/out`,
  loader: { ".ttf": "dataurl" },
  legalComments: "none",
  logLevel: "warning",
});
await build({
  entryPoints: { worker: `${esm}/vs/editor/editor.worker.js` },
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  outdir: `${root}/vendor-src/.gen/out`,
  legalComments: "none",
  logLevel: "warning",
});
mkdirSync(`${root}/assets`, { recursive: true });
writeFileSync(`${root}/assets/monaco.js`, readFileSync(`${root}/vendor-src/.gen/out/monaco.js`));
writeFileSync(`${root}/assets/monaco.css`, readFileSync(`${root}/vendor-src/.gen/out/monaco.css`));
writeFileSync(`${root}/assets/editor.worker.js`, readFileSync(`${root}/vendor-src/.gen/out/worker.js`));
console.log("built assets/monaco.js, assets/monaco.css, assets/editor.worker.js");
