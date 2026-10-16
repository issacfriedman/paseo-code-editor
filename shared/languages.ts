export type ServerId = "typescript" | "python" | "json" | "css" | "html" | "swift" | "go" | "rust";

export type LanguageInfo = {
  // Key used by the editors to pick a grammar.
  id: string;
  label: string;
  // LSP textDocument languageId.
  lspLanguageId: string;
  serverId: ServerId | null;
};

const lang = (id: string, label: string, lspLanguageId: string, serverId: ServerId | null) => ({
  id,
  label,
  lspLanguageId,
  serverId,
});

const BY_EXTENSION: Record<string, LanguageInfo> = {
  ts: lang("typescript", "TypeScript", "typescript", "typescript"),
  mts: lang("typescript", "TypeScript", "typescript", "typescript"),
  cts: lang("typescript", "TypeScript", "typescript", "typescript"),
  tsx: lang("tsx", "TSX", "typescriptreact", "typescript"),
  js: lang("javascript", "JavaScript", "javascript", "typescript"),
  mjs: lang("javascript", "JavaScript", "javascript", "typescript"),
  cjs: lang("javascript", "JavaScript", "javascript", "typescript"),
  jsx: lang("jsx", "JSX", "javascriptreact", "typescript"),
  py: lang("python", "Python", "python", "python"),
  json: lang("json", "JSON", "json", "json"),
  jsonc: lang("json", "JSON", "jsonc", "json"),
  css: lang("css", "CSS", "css", "css"),
  scss: lang("css", "SCSS", "scss", "css"),
  less: lang("css", "Less", "less", "css"),
  html: lang("html", "HTML", "html", "html"),
  htm: lang("html", "HTML", "html", "html"),
  vue: lang("vue", "Vue", "vue", "typescript"),
  svelte: lang("html", "Svelte", "svelte", null),
  md: lang("markdown", "Markdown", "markdown", null),
  mdx: lang("markdown", "MDX", "mdx", null),
  yaml: lang("yaml", "YAML", "yaml", null),
  yml: lang("yaml", "YAML", "yaml", null),
  rs: lang("rust", "Rust", "rust", "rust"),
  go: lang("go", "Go", "go", "go"),
  java: lang("java", "Java", "java", null),
  kt: lang("java", "Kotlin", "kotlin", null),
  c: lang("cpp", "C", "c", null),
  h: lang("cpp", "C header", "c", null),
  cpp: lang("cpp", "C++", "cpp", null),
  cc: lang("cpp", "C++", "cpp", null),
  hpp: lang("cpp", "C++ header", "cpp", null),
  m: lang("cpp", "Objective-C", "objective-c", null),
  sql: lang("sql", "SQL", "sql", null),
  xml: lang("xml", "XML", "xml", null),
  svg: lang("xml", "SVG", "xml", null),
  plist: lang("xml", "Property list", "xml", null),
  swift: lang("swift", "Swift", "swift", "swift"),
  sh: lang("shell", "Shell", "shellscript", null),
  bash: lang("shell", "Shell", "shellscript", null),
  zsh: lang("shell", "Shell", "shellscript", null),
  toml: lang("toml", "TOML", "toml", null),
  rb: lang("ruby", "Ruby", "ruby", null),
};

const BY_NAME: Record<string, LanguageInfo> = {
  dockerfile: lang("dockerfile", "Dockerfile", "dockerfile", null),
  ".zshrc": BY_EXTENSION.zsh!,
  ".bashrc": BY_EXTENSION.sh!,
  "tsconfig.json": BY_EXTENSION.jsonc!,
};

export const PLAIN_TEXT: LanguageInfo = lang("text", "Plain text", "plaintext", null);

export function languageForPath(path: string): LanguageInfo {
  const name = (path.split("/").pop() ?? path).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return PLAIN_TEXT;
  return BY_EXTENSION[name.slice(dot + 1)] ?? PLAIN_TEXT;
}
