import type { Monaco } from "./load";
import { isDark } from "../colors";

export type PaseoColors = {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
};

type Palette = {
  dark: boolean;
  bg: string;
  fg: string;
  raised: string;
  border: string;
  muted: string;
  accent: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  fn: string;
  type: string;
  variable: string;
  property: string;
  tag: string;
  attribute: string;
  operator: string;
  italicTypes?: boolean;
};

const PALETTES: Record<string, Omit<Palette, "bg" | "fg" | "raised" | "border" | "muted" | "accent"> & Partial<Palette>> = {
  "one-dark-pro": { dark: true, bg: "#282c34", fg: "#abb2bf", raised: "#21252b", border: "#3e4451", muted: "#7f848e", accent: "#528bff", keyword: "#c678dd", string: "#98c379", number: "#d19a66", comment: "#7f848e", fn: "#61afef", type: "#e5c07b", variable: "#e06c75", property: "#e06c75", tag: "#e06c75", attribute: "#d19a66", operator: "#56b6c2" },
  "github-dark": { dark: true, bg: "#0d1117", fg: "#e6edf3", raised: "#161b22", border: "#30363d", muted: "#8b949e", accent: "#2f81f7", keyword: "#ff7b72", string: "#a5d6ff", number: "#79c0ff", comment: "#8b949e", fn: "#d2a8ff", type: "#ffa657", variable: "#ffa657", property: "#79c0ff", tag: "#7ee787", attribute: "#79c0ff", operator: "#ff7b72" },
  "github-light": { dark: false, bg: "#ffffff", fg: "#1f2328", raised: "#f6f8fa", border: "#d0d7de", muted: "#6e7781", accent: "#0969da", keyword: "#cf222e", string: "#0a3069", number: "#0550ae", comment: "#6e7781", fn: "#8250df", type: "#953800", variable: "#953800", property: "#0550ae", tag: "#116329", attribute: "#0550ae", operator: "#cf222e" },
  dracula: { dark: true, bg: "#282a36", fg: "#f8f8f2", raised: "#21222c", border: "#44475a", muted: "#6272a4", accent: "#bd93f9", keyword: "#ff79c6", string: "#f1fa8c", number: "#bd93f9", comment: "#6272a4", fn: "#50fa7b", type: "#8be9fd", variable: "#f8f8f2", property: "#f8f8f2", tag: "#ff79c6", attribute: "#50fa7b", operator: "#ff79c6", italicTypes: true },
  monokai: { dark: true, bg: "#272822", fg: "#f8f8f2", raised: "#1e1f1c", border: "#414339", muted: "#75715e", accent: "#a6e22e", keyword: "#f92672", string: "#e6db74", number: "#ae81ff", comment: "#75715e", fn: "#a6e22e", type: "#66d9ef", variable: "#f8f8f2", property: "#f8f8f2", tag: "#f92672", attribute: "#a6e22e", operator: "#f92672", italicTypes: true },
};

const ONE_DARK_SYNTAX = { keyword: "#c678dd", string: "#98c379", number: "#d19a66", comment: "#7f848e", fn: "#61afef", type: "#e5c07b", variable: "#e06c75", property: "#e06c75", tag: "#e06c75", attribute: "#d19a66", operator: "#56b6c2" };
const ONE_LIGHT_SYNTAX = { keyword: "#a626a4", string: "#50a14f", number: "#986801", comment: "#a0a1a7", fn: "#4078f2", type: "#c18401", variable: "#e45649", property: "#e45649", tag: "#e45649", attribute: "#986801", operator: "#0184bc" };

const hex = (color: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : fallback);
const bare = (color: string) => color.replace("#", "");

function paseoPalette(colors: PaseoColors): Palette {
  const dark = isDark(colors.surface0);
  return {
    dark,
    bg: hex(colors.surface0, dark ? "#1e1e1e" : "#ffffff"),
    fg: hex(colors.foreground, dark ? "#d4d4d4" : "#1f1f1f"),
    raised: hex(colors.surface1, dark ? "#252526" : "#f3f3f3"),
    border: hex(colors.border, dark ? "#3c3c3c" : "#e5e5e5"),
    muted: hex(colors.foregroundMuted, dark ? "#858585" : "#6e6e6e"),
    accent: hex(colors.accent, "#0078d4"),
    ...(dark ? ONE_DARK_SYNTAX : ONE_LIGHT_SYNTAX),
  };
}

function define(monaco: Monaco, name: string, p: Palette) {
  const italic = p.italicTypes ? "italic" : "";
  const rules = [
    { token: "", foreground: bare(p.fg) },
    { token: "comment", foreground: bare(p.comment), fontStyle: "italic" },
    { token: "keyword", foreground: bare(p.keyword) },
    { token: "string", foreground: bare(p.string) },
    { token: "string.escape", foreground: bare(p.operator) },
    { token: "regexp", foreground: bare(p.operator) },
    { token: "number", foreground: bare(p.number) },
    { token: "constant", foreground: bare(p.number) },
    { token: "type", foreground: bare(p.type), fontStyle: italic },
    { token: "type.identifier", foreground: bare(p.type), fontStyle: italic },
    { token: "identifier", foreground: bare(p.fg) },
    { token: "variable", foreground: bare(p.variable) },
    { token: "predefined", foreground: bare(p.fn) },
    { token: "operator", foreground: bare(p.operator) },
    { token: "delimiter", foreground: bare(p.fg) },
    { token: "tag", foreground: bare(p.tag) },
    { token: "metatag", foreground: bare(p.tag) },
    { token: "attribute.name", foreground: bare(p.attribute) },
    { token: "attribute.value", foreground: bare(p.string) },
    { token: "annotation", foreground: bare(p.type) },
    // Semantic tokens from the language servers.
    { token: "function", foreground: bare(p.fn) },
    { token: "method", foreground: bare(p.fn) },
    { token: "class", foreground: bare(p.type), fontStyle: italic },
    { token: "interface", foreground: bare(p.type), fontStyle: italic },
    { token: "enum", foreground: bare(p.type) },
    { token: "typeParameter", foreground: bare(p.type) },
    { token: "namespace", foreground: bare(p.type) },
    { token: "property", foreground: bare(p.property) },
    { token: "enumMember", foreground: bare(p.number) },
    { token: "parameter", foreground: bare(p.fg), fontStyle: "italic" },
    { token: "variable.readonly", foreground: bare(p.number) },
  ];
  monaco.editor.defineTheme(name, {
    base: p.dark ? "vs-dark" : "vs",
    inherit: true,
    rules,
    colors: {
      "editor.background": p.bg,
      "editor.foreground": p.fg,
      "editorGutter.background": p.bg,
      "minimap.background": p.bg,
      "editorLineNumber.foreground": p.muted + "99",
      "editorLineNumber.activeForeground": p.fg,
      "editorCursor.foreground": p.accent,
      "editor.selectionBackground": p.accent + "44",
      "editor.inactiveSelectionBackground": p.accent + "22",
      "editor.lineHighlightBackground": p.fg + "0a",
      "editor.lineHighlightBorder": "#00000000",
      "editorIndentGuide.background1": p.border,
      "editorIndentGuide.activeBackground1": p.muted,
      "editorWidget.background": p.raised,
      "editorWidget.border": p.border,
      "editorSuggestWidget.background": p.raised,
      "editorSuggestWidget.border": p.border,
      "editorSuggestWidget.selectedBackground": p.accent + "40",
      "editorHoverWidget.background": p.raised,
      "editorHoverWidget.border": p.border,
      "editorStickyScroll.background": p.bg,
      "editorStickyScrollHover.background": p.raised,
      "scrollbarSlider.background": p.muted + "33",
      "scrollbarSlider.hoverBackground": p.muted + "55",
      "focusBorder": p.accent + "88",
    },
  });
}

export function applyTheme(monaco: Monaco, theme: string, colors: PaseoColors) {
  if (theme === "vs-dark" || theme === "vs" || theme === "hc-black") {
    monaco.editor.setTheme(theme);
    return;
  }
  const preset = PALETTES[theme];
  const palette = preset ? (preset as Palette) : paseoPalette(colors);
  const name = preset ? `paseo-${theme}` : "paseo-follow";
  define(monaco, name, palette);
  monaco.editor.setTheme(name);
}
