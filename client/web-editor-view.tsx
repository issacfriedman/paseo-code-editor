import { useEffect, useRef } from "react";
import { View } from "react-native";
import type { EditorColors, LspHub, WebEditorHandle, createWebEditor } from "./web-editor/mount";

type Props = {
  visible: boolean;
  doc: string;
  uri: string;
  absolutePath: string;
  languageId: string;
  lspLanguageId: string;
  serverId: string | null;
  colors: EditorColors;
  hub: LspHub;
  create: typeof createWebEditor;
  onReady(handle: WebEditorHandle): void;
  onDispose(): void;
  onChange(): void;
  onSave(): void;
  onQuickOpen(): void;
};

// Web only. React Native Web hands back the real DOM node for a View ref, and CodeMirror mounts into it.
export function WebEditorView(props: Props) {
  const host = useRef<View>(null);
  const handle = useRef<WebEditorHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const p = latest.current;
    if (host.current) {
      handle.current = p.create({
        parent: host.current,
        doc: p.doc,
        uri: p.uri,
        absolutePath: p.absolutePath,
        languageId: p.languageId,
        lspLanguageId: p.lspLanguageId,
        serverId: p.serverId,
        colors: p.colors,
        hub: p.hub,
        onChange: () => latest.current.onChange(),
        onSave: () => latest.current.onSave(),
        onQuickOpen: () => latest.current.onQuickOpen(),
      });
      p.onReady(handle.current);
    }
    return () => {
      handle.current?.destroy();
      handle.current = null;
      latest.current.onDispose();
    };
    // The editor lives for the life of the tab; content changes go through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handle.current?.setColors(props.colors);
  }, [props.colors]);

  useEffect(() => {
    if (props.visible) setTimeout(() => handle.current?.focus(), 0);
  }, [props.visible]);

  return (
    <View
      ref={host}
      style={{ flex: 1, minHeight: 0, overflow: "hidden", display: props.visible ? "flex" : "none" }}
    />
  );
}
