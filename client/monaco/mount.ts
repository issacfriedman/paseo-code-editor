import type { EditorPrefs } from "../../shared/settings";
import { ensureFont, fontFamily } from "./fonts";
import { loadMonaco, type AssetRpc, type Monaco } from "./load";
import { LspHub, pathToUri, type LspRpc, type LspStatus } from "./lsp";
import { applyTheme, type PaseoColors } from "./themes";

/* eslint-disable @typescript-eslint/no-explicit-any */
export { LspHub, pathToUri, loadMonaco, type LspRpc, type LspStatus, type PaseoColors, type Monaco };

// lspLanguageId -> Monaco tokenizer. Monaco has no separate TSX or Vue grammar.
const MONACO_LANGUAGE: Record<string, string> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "javascript",
  javascriptreact: "javascript",
  vue: "html",
  jsonc: "json",
  shellscript: "shell",
  toml: "ini",
  c: "cpp",
  mdx: "markdown",
  plaintext: "plaintext",
};

export function monacoLanguage(lspLanguageId: string): string {
  return MONACO_LANGUAGE[lspLanguageId] ?? lspLanguageId;
}

let jsonRegistered = false;
function registerJson(monaco: Monaco) {
  if (jsonRegistered) return;
  jsonRegistered = true;
  // Monaco's JSON support lives in a worker we do not ship; a small tokenizer is enough for colors.
  monaco.languages.register({ id: "json", extensions: [".json", ".jsonc"] });
  monaco.languages.setMonarchTokensProvider("json", {
    tokenizer: {
      root: [
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "type"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
        [/\b(?:true|false|null)\b/, "keyword"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/[{}[\],:]/, "delimiter"],
      ],
      comment: [
        [/\*\//, "comment", "@pop"],
        [/./, "comment"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("json", {
    brackets: [["{", "}"], ["[", "]"]],
    autoClosingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: '"', close: '"' }],
  });
}

// Jump to definition in another file opens it in the panel that owns that workspace.
const openers = new Map<string, (absolutePath: string, line?: number, column?: number) => boolean>();
let openerRegistered = false;
export function registerPathOpener(root: string, open: (absolutePath: string, line?: number, column?: number) => boolean) {
  openers.set(root, open);
  return () => {
    if (openers.get(root) === open) openers.delete(root);
  };
}
function ensureOpener(monaco: Monaco) {
  if (openerRegistered) return;
  openerRegistered = true;
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source: any, resource: any, selectionOrPosition: any) {
      const absolutePath = resource.path as string;
      const line = selectionOrPosition?.startLineNumber ?? selectionOrPosition?.lineNumber;
      const column = selectionOrPosition?.startColumn ?? selectionOrPosition?.column;
      for (const [root, open] of openers) {
        if (absolutePath.startsWith(root + "/")) return open(absolutePath, line, column);
      }
      return false;
    },
  });
}

export function editorOptions(prefs: EditorPrefs) {
  return {
    fontFamily: fontFamily(prefs.font),
    fontLigatures: prefs.ligatures,
    fontSize: prefs.fontSize,
    lineHeight: prefs.lineHeight,
    minimap: { enabled: prefs.minimap },
    wordWrap: prefs.wordWrap ? "on" : "off",
    stickyScroll: { enabled: prefs.stickyScroll },
  };
}

export type MonacoEditorOptions = {
  monaco: Monaco;
  assets: AssetRpc;
  parent: unknown;
  doc: string;
  absolutePath: string;
  lspLanguageId: string;
  serverId: string | null;
  prefs: EditorPrefs;
  colors: PaseoColors;
  hub: LspHub;
  onChange(): void;
  onSave(): void;
  onToggleFiles(): void;
};

export type MonacoEditorHandle = {
  getText(): string;
  replaceText(text: string): void;
  setPrefs(prefs: EditorPrefs, colors: PaseoColors): void;
  reveal(line: number, column: number): void;
  focus(): void;
  destroy(): void;
};

export function createMonacoEditor(o: MonacoEditorOptions): MonacoEditorHandle {
  const { monaco } = o;
  registerJson(monaco);
  ensureOpener(monaco);
  const uriString = pathToUri(o.absolutePath);
  const uri = monaco.Uri.parse(uriString);
  // Ownership first: the LSP client opens the model on the server as soon as it exists.
  if (o.serverId) o.hub.own(o.serverId, uriString, o.lspLanguageId);
  const existing = monaco.editor.getModel(uri);
  const model = existing ?? monaco.editor.createModel(o.doc, monacoLanguage(o.lspLanguageId), uri);
  if (existing && existing.getValue() !== o.doc) existing.setValue(o.doc);

  applyTheme(monaco, o.prefs.theme, o.colors);
  const editor = monaco.editor.create(o.parent, {
    model,
    automaticLayout: true,
    "semanticHighlighting.enabled": true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: "active", indentation: true },
    smoothScrolling: true,
    cursorSmoothCaretAnimation: "on",
    cursorBlinking: "smooth",
    renderLineHighlight: "all",
    scrollBeyondLastLine: false,
    padding: { top: 8 },
    fixedOverflowWidgets: true,
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    tabCompletion: "on",
    inlayHints: { enabled: "on" },
    ...editorOptions(o.prefs),
  });
  void ensureFont(o.assets, o.prefs.font).then(() => monaco.editor.remeasureFonts());

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => o.onSave());
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => o.onToggleFiles());
  const changes = model.onDidChangeContent(() => o.onChange());

  return {
    getText: () => model.getValue(),
    replaceText(text) {
      if (text === model.getValue()) return;
      // pushEditOperations keeps undo history, unlike setValue.
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
    },
    setPrefs(prefs, colors) {
      applyTheme(monaco, prefs.theme, colors);
      editor.updateOptions(editorOptions(prefs));
      void ensureFont(o.assets, prefs.font).then(() => monaco.editor.remeasureFonts());
    },
    reveal(line, column) {
      editor.setPosition({ lineNumber: line, column });
      editor.revealPositionInCenter({ lineNumber: line, column });
      editor.focus();
    },
    focus: () => editor.focus(),
    destroy() {
      changes.dispose();
      editor.dispose();
      // Dispose while still owned, so the server receives didClose.
      model.dispose();
      if (o.serverId) o.hub.disown(o.serverId, uriString);
    },
  };
}
