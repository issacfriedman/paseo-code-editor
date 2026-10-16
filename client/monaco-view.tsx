import { useEffect, useRef } from "react";
import { View } from "react-native";
import type { EditorPrefs } from "../shared/settings";
import type { createMonacoEditor, MonacoEditorHandle, PaseoColors } from "./monaco/mount";

type Props = {
  create: typeof createMonacoEditor;
  options: Omit<Parameters<typeof createMonacoEditor>[0], "parent" | "onChange" | "onSave" | "onToggleFiles">;
  visible: boolean;
  prefs: EditorPrefs;
  colors: PaseoColors;
  onReady(handle: MonacoEditorHandle): void;
  onDispose(): void;
  onChange(): void;
  onSave(): void;
  onToggleFiles(): void;
};

// Web only. React Native Web hands back the real DOM node for a View ref, and Monaco mounts into it.
export function MonacoView(props: Props) {
  const host = useRef<View>(null);
  const handle = useRef<MonacoEditorHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const p = latest.current;
    if (host.current) {
      handle.current = p.create({
        ...p.options,
        parent: host.current,
        onChange: () => latest.current.onChange(),
        onSave: () => latest.current.onSave(),
        onToggleFiles: () => latest.current.onToggleFiles(),
      });
      p.onReady(handle.current);
    }
    return () => {
      handle.current?.destroy();
      handle.current = null;
      latest.current.onDispose();
    };
    // The editor lives for the life of the tab; later changes go through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handle.current?.setPrefs(props.prefs, props.colors);
  }, [props.prefs, props.colors]);

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
