import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { languageExtension } from "./languages";
import { editorTheme, isDarkColor, type EditorColors } from "./theme";
import type { LspHub } from "./lsp";

export type { EditorColors } from "./theme";
export { LspHub, pathToUri, type LspRpc, type LspStatus } from "./lsp";

export type WebEditorOptions = {
  parent: unknown;
  doc: string;
  uri: string;
  absolutePath: string;
  languageId: string;
  lspLanguageId: string;
  serverId: string | null;
  colors: EditorColors;
  hub: LspHub;
  onChange(): void;
  onSave(): void;
  onQuickOpen(): void;
};

export type WebEditorHandle = {
  getText(): string;
  replaceText(text: string): void;
  setColors(colors: EditorColors): void;
  focus(): void;
  destroy(): void;
};

const basics: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
    indentWithTab,
  ]),
];

export function createWebEditor(options: WebEditorOptions): WebEditorHandle {
  const theme = new Compartment();
  const lsp = new Compartment();
  let destroyed = false;

  const view = new EditorView({
    parent: options.parent as never,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              options.onSave();
              return true;
            },
          },
          {
            key: "Mod-p",
            preventDefault: true,
            run: () => {
              options.onQuickOpen();
              return true;
            },
          },
        ]),
        basics,
        languageExtension(options.languageId),
        theme.of(editorTheme(options.colors, isDarkColor(options.colors.surface0))),
        lsp.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange();
        }),
      ],
    }),
  });
  options.hub.registerView(options.absolutePath, view);

  if (options.serverId) {
    void options.hub.connect(options.serverId).then((connection) => {
      if (!connection || destroyed) return;
      view.dispatch({ effects: lsp.reconfigure(connection.client.plugin(options.uri, options.lspLanguageId)) });
    });
  }

  return {
    getText: () => view.state.doc.toString(),
    replaceText(text) {
      if (text === view.state.doc.toString()) return;
      const head = Math.min(view.state.selection.main.head, text.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: head },
      });
    },
    setColors(colors) {
      view.dispatch({ effects: theme.reconfigure(editorTheme(colors, isDarkColor(colors.surface0))) });
    },
    focus: () => view.focus(),
    destroy() {
      destroyed = true;
      options.hub.unregisterView(options.absolutePath, view);
      // Dropping the LSP plugin closes the file on the server before the view goes away.
      view.dispatch({ effects: lsp.reconfigure([]) });
      view.destroy();
    },
  };
}
