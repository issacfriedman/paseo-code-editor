import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";

export type EditorColors = {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
};

const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

// Paints CodeMirror with the active Paseo theme, so every Paseo theme works without a second palette.
export function editorTheme(colors: EditorColors, dark: boolean): Extension {
  return [
    EditorView.theme(
      {
        "&": {
          height: "100%",
          color: colors.foreground,
          backgroundColor: colors.surface0,
          fontSize: "13px",
        },
        ".cm-scroller": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          lineHeight: "1.55",
        },
        ".cm-content": { caretColor: colors.accent },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: colors.accent },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
          { backgroundColor: mix(colors.accent, 28) },
        ".cm-activeLine": { backgroundColor: mix(colors.foreground, 4) },
        ".cm-activeLineGutter": { backgroundColor: mix(colors.foreground, 6), color: colors.foreground },
        ".cm-gutters": {
          backgroundColor: colors.surface0,
          color: colors.foregroundMuted,
          border: "none",
          borderRight: `1px solid ${colors.border}`,
        },
        ".cm-selectionMatch": { backgroundColor: mix(colors.accent, 14) },
        "&.cm-focused .cm-matchingBracket": { backgroundColor: mix(colors.accent, 22), outline: "none" },
        ".cm-searchMatch": { backgroundColor: mix(colors.accent, 22), outline: `1px solid ${mix(colors.accent, 50)}` },
        ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: mix(colors.accent, 40) },
        ".cm-panels": { backgroundColor: colors.surface1, color: colors.foreground },
        ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${colors.border}` },
        ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${colors.border}` },
        ".cm-textfield": {
          backgroundColor: colors.surface2,
          color: colors.foreground,
          border: `1px solid ${colors.border}`,
          borderRadius: "4px",
        },
        ".cm-button": {
          backgroundImage: "none",
          backgroundColor: colors.surface2,
          color: colors.foreground,
          border: `1px solid ${colors.border}`,
          borderRadius: "4px",
        },
        ".cm-tooltip": {
          backgroundColor: colors.surface1,
          color: colors.foreground,
          border: `1px solid ${colors.border}`,
          borderRadius: "6px",
          maxWidth: "560px",
        },
        ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
          backgroundColor: mix(colors.accent, 30),
          color: colors.foreground,
        },
        ".cm-tooltip.cm-tooltip-hover, .cm-lsp-documentation": { fontSize: "12px", lineHeight: "1.45" },
        ".cm-lsp-documentation pre, .cm-lsp-documentation code": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        ".cm-foldPlaceholder": { backgroundColor: colors.surface2, border: "none", color: colors.foregroundMuted },
        ".cm-diagnostic": { borderLeftWidth: "3px" },
      },
      { dark },
    ),
    syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle, { fallback: false }),
  ];
}

export { isDark as isDarkColor } from "../colors";
