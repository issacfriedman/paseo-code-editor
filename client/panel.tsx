import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { type PluginWorkspacePanelProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { languageForPath, type LanguageInfo } from "../shared/languages";
import {
  pollLsp,
  readFile,
  sendLsp,
  startLsp,
  statFile,
  stopLsp,
  workspaceRootRpc,
  writeFile,
} from "../shared/contracts";
import { FileBrowser } from "./file-browser";
import { subscribeOpen } from "./open-requests";
import { NativeEditor } from "./native/native-editor";
import { canHighlight, MAX_HIGHLIGHT_CHARS } from "./native/highlight";
import { WebEditorView } from "./web-editor-view";
import type * as WebKit from "./web-editor/mount";

type Tab = {
  path: string;
  language: LanguageInfo;
  state: "loading" | "ready" | "error" | "binary" | "tooLarge";
  error: string | null;
  // Text as last loaded from or saved to disk.
  diskText: string;
  mtimeMs: number | null;
  dirty: boolean;
  changedOnDisk: boolean;
  // Phone editor text. The web editor keeps its own document.
  nativeText: string;
};

const isWeb = Platform.OS === "web";
const WATCH_MS = 4000;

export function EditorPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const toast = useToast();
  const rpc = {
    root: useRpc(workspaceRootRpc),
    read: useRpc(readFile),
    stat: useRpc(statFile),
    write: useRpc(writeFile),
    start: useRpc(startLsp),
    send: useRpc(sendLsp),
    poll: useRpc(pollLsp),
    stop: useRpc(stopLsp),
  };
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // Wide layouts keep the tree beside the editor. Compact layouts show it over the editor.
  const [treeOpen, setTreeOpen] = useState(true);
  const [root, setRoot] = useState<string | null>(null);
  const [lspStatus, setLspStatus] = useState<Record<string, WebKit.LspStatus>>({});
  const [closeArmed, setCloseArmed] = useState<string | null>(null);
  const [colored, setColored] = useState(true);
  const [kit, setKit] = useState<typeof WebKit | null>(null);
  const handles = useRef(new Map<string, WebKit.WebEditorHandle>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const updateTab = useCallback((path: string, patch: Partial<Tab>) => {
    setTabs((current) => current.map((tab) => (tab.path === path ? { ...tab, ...patch } : tab)));
  }, []);

  useEffect(() => {
    rpcRef.current.root({ workspaceId }).then(
      (result) => setRoot(result.root),
      (error) => toast.error(`Could not open workspace: ${String(error)}`),
    );
  }, [toast, workspaceId]);

  const compactRef = useRef(layout.compact);
  compactRef.current = layout.compact;
  const openPath = useCallback(
    (path: string) => {
      if (compactRef.current) setTreeOpen(false);
      setActive(path);
      if (tabsRef.current.some((tab) => tab.path === path)) return;
      const tab: Tab = {
        path,
        language: languageForPath(path),
        state: "loading",
        error: null,
        diskText: "",
        mtimeMs: null,
        dirty: false,
        changedOnDisk: false,
        nativeText: "",
      };
      setTabs((current) => [...current, tab]);
      rpcRef.current.read({ workspaceId, path }).then(
        (file) =>
          updateTab(path, {
            state: file.binary ? "binary" : file.tooLarge ? "tooLarge" : "ready",
            diskText: file.content,
            nativeText: file.content,
            mtimeMs: file.mtimeMs,
          }),
        (error) => updateTab(path, { state: "error", error: String(error) }),
      );
    },
    [updateTab, workspaceId],
  );
  const openPathRef = useRef(openPath);
  openPathRef.current = openPath;

  // Files tapped in the Files-sidebar tree arrive here.
  useEffect(() => subscribeOpen(workspaceId, (path) => openPathRef.current(path)), [workspaceId]);
  const rootRef = useRef(root);
  rootRef.current = root;

  // CodeMirror and the LSP client load on web only, so the phone app never runs DOM code.
  const clientId = useMemo(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => {
    if (!isWeb) return;
    let cancelled = false;
    void import("./web-editor/mount").then((mod) => {
      if (!cancelled) setKit(mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const hub = useMemo(() => {
    if (!kit) return null;
    return new kit.LspHub(
      {
        start: (input) => rpcRef.current.start(input),
        send: (input) => rpcRef.current.send(input),
        poll: (input) => rpcRef.current.poll(input),
        stop: (input) => rpcRef.current.stop(input),
      },
      workspaceId,
      clientId,
      (serverId, status) => setLspStatus((s) => ({ ...s, [serverId]: status })),
      (absolutePath) => {
        const base = rootRef.current;
        if (!base || !absolutePath.startsWith(base + "/")) return false;
        openPathRef.current(absolutePath.slice(base.length + 1));
        return true;
      },
    );
  }, [kit, workspaceId, clientId]);
  useEffect(() => () => hub?.dispose(), [hub]);

  const currentText = useCallback((tab: Tab) => {
    if (isWeb) return handles.current.get(tab.path)?.getText() ?? tab.diskText;
    return tab.nativeText;
  }, []);

  const reload = useCallback(
    async (path: string) => {
      try {
        const file = await rpcRef.current.read({ workspaceId, path });
        handles.current.get(path)?.replaceText(file.content);
        updateTab(path, {
          diskText: file.content,
          nativeText: file.content,
          mtimeMs: file.mtimeMs,
          dirty: false,
          changedOnDisk: false,
        });
      } catch (error) {
        toast.error(`Could not reload: ${String(error)}`);
      }
    },
    [toast, updateTab, workspaceId],
  );

  const save = useCallback(
    async (path: string, force = false) => {
      const tab = tabsRef.current.find((t) => t.path === path);
      if (!tab || tab.state !== "ready") return;
      const text = currentText(tab);
      try {
        const result = await rpcRef.current.write({
          workspaceId,
          path,
          content: text,
          expectedMtimeMs: tab.mtimeMs,
          force,
        });
        if (result.conflict) {
          updateTab(path, { changedOnDisk: true });
          toast.show("Someone else changed this file. Reload it or overwrite.", { variant: "warning" });
          return;
        }
        const stillSame = currentText(tabsRef.current.find((t) => t.path === path) ?? tab) === text;
        updateTab(path, { diskText: text, mtimeMs: result.mtimeMs, dirty: !stillSame, changedOnDisk: false });
        toast.show("Saved", { variant: "success", durationMs: 1200 });
      } catch (error) {
        toast.error(`Could not save: ${String(error)}`);
      }
    },
    [currentText, toast, updateTab, workspaceId],
  );
  const saveRef = useRef(save);
  saveRef.current = save;

  // Agents edit files all the time. Pick up their changes when nothing is unsaved here.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      const tab = tabsRef.current.find((t) => t.path === active);
      if (!tab || tab.state !== "ready" || tab.mtimeMs === null) return;
      try {
        const info = await rpcRef.current.stat({ workspaceId, path: active });
        if (!info.exists || info.mtimeMs === tab.mtimeMs) return;
        if (tab.dirty) updateTab(active, { changedOnDisk: true });
        else await reload(active);
      } catch {
        // Offline host; try again on the next tick.
      }
    }, WATCH_MS);
    return () => clearInterval(timer);
  }, [active, reload, updateTab, workspaceId]);

  const closeTab = useCallback(
    (path: string) => {
      const tab = tabsRef.current.find((t) => t.path === path);
      if (tab?.dirty && closeArmed !== path) {
        setCloseArmed(path);
        toast.show("Unsaved changes. Tap × again to close without saving.", { variant: "warning" });
        return;
      }
      setCloseArmed(null);
      handles.current.delete(path);
      setTabs((current) => {
        const next = current.filter((t) => t.path !== path);
        if (active === path) setActive(next[next.length - 1]?.path ?? null);
        if (!next.length) setTreeOpen(true);
        return next;
      });
    },
    [active, closeArmed, toast],
  );

  const c = theme.colors;
  const colors = useMemo(
    () => ({
      surface0: c.surface0,
      surface1: c.surface1,
      surface2: c.surface2,
      border: c.border,
      foreground: c.foreground,
      foregroundMuted: c.foregroundMuted,
      accent: c.accent,
    }),
    [c.surface0, c.surface1, c.surface2, c.border, c.foreground, c.foregroundMuted, c.accent],
  );
  const activeTab = tabs.find((t) => t.path === active) ?? null;
  const status = activeTab?.language.serverId ? lspStatus[activeTab.language.serverId] : undefined;

  const button = (label: string, icon: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: pressed ? c.surface2 : c.surface1,
      })}
    >
      <Icon name={icon} size={14} color={c.foreground} />
      {layout.compact ? null : <Text style={{ color: c.foreground, fontSize: 13 }}>{label}</Text>}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        {button("Files", treeOpen ? "PanelLeftClose" : "PanelLeftOpen", () => setTreeOpen((v) => !v))}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {tabs.map((tab) => {
              const selected = tab.path === active;
              return (
                <View
                  key={tab.path}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 6,
                    backgroundColor: selected ? c.surface2 : "transparent",
                  }}
                >
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityLabel={tab.path}
                    onPress={() => {
                      setActive(tab.path);
                      if (layout.compact) setTreeOpen(false);
                    }}
                    style={{ paddingLeft: 10, paddingVertical: 6 }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: selected ? c.foreground : c.foregroundMuted, fontSize: 13, maxWidth: 180 }}
                    >
                      {tab.dirty ? "● " : ""}
                      {tab.path.slice(tab.path.lastIndexOf("/") + 1)}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Close ${tab.path}`}
                    onPress={() => closeTab(tab.path)}
                    style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                  >
                    <Text style={{ color: c.foregroundMuted, fontSize: 13 }}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
        {!isWeb && activeTab && canHighlight(activeTab.language.id)
          ? button(colored ? "Colors on" : "Colors off", "Palette", () => setColored((v) => !v))
          : null}
        {button("Save", "Save", () => active && void save(active), !activeTab?.dirty)}
      </View>

      {activeTab?.changedOnDisk ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 8,
            backgroundColor: c.surface1,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={{ color: c.statusWarning, flex: 1, fontSize: 13 }}>
            This file changed on disk while you were editing.
          </Text>
          {button("Reload", "RotateCcw", () => void reload(activeTab.path))}
          {button("Overwrite", "Save", () => void save(activeTab.path, true))}
        </View>
      ) : null}

      <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
      {treeOpen && !layout.compact ? (
        <View style={{ width: 250, borderRightWidth: 1, borderRightColor: c.border }}>
          <FileBrowser theme={theme} compact={false} workspaceId={workspaceId} activePath={active} onPick={openPath} />
        </View>
      ) : null}
      <View style={{ flex: 1, minHeight: 0 }}>
        {tabs.map((tab) => {
          const visible = tab.path === active;
          if (tab.state !== "ready") {
            if (!visible) return null;
            const message =
              tab.state === "loading"
                ? "Loading…"
                : tab.state === "binary"
                  ? "This is a binary file. It cannot be edited here."
                  : tab.state === "tooLarge"
                    ? "This file is larger than 2 MB. It cannot be edited here."
                    : `Could not open: ${tab.error}`;
            return (
              <View key={tab.path} style={{ flex: 1, padding: 16 }}>
                <Text style={{ color: c.foregroundMuted }}>{message}</Text>
              </View>
            );
          }
          if (isWeb) {
            if (!kit || !hub || !root) return null;
            const absolutePath = `${root}/${tab.path}`;
            return (
              <WebEditorView
                key={tab.path}
                visible={visible}
                doc={tab.diskText}
                uri={kit.pathToUri(absolutePath)}
                absolutePath={absolutePath}
                languageId={tab.language.id}
                lspLanguageId={tab.language.lspLanguageId}
                serverId={tab.language.serverId}
                colors={colors}
                hub={hub}
                create={kit.createWebEditor}
                onReady={(handle) => handles.current.set(tab.path, handle)}
                onDispose={() => handles.current.delete(tab.path)}
                onChange={() => {
                  const text = handles.current.get(tab.path)?.getText();
                  const dirty = text !== undefined && text !== tabsRef.current.find((t) => t.path === tab.path)?.diskText;
                  if (dirty !== tabsRef.current.find((t) => t.path === tab.path)?.dirty) updateTab(tab.path, { dirty });
                }}
                onSave={() => void saveRef.current(tab.path)}
                onQuickOpen={() => setTreeOpen(true)}
              />
            );
          }
          if (!visible) return null;
          return (
            <NativeEditor
              key={tab.path}
              text={tab.nativeText}
              languageId={tab.language.id}
              colored={colored && tab.nativeText.length <= MAX_HIGHLIGHT_CHARS}
              theme={theme}
              onChangeText={(text) => updateTab(tab.path, { nativeText: text, dirty: text !== tab.diskText })}
            />
          );
        })}
        {!tabs.length && !(treeOpen && layout.compact) ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <Text style={{ color: c.foregroundMuted }}>Pick a file from the tree.</Text>
            {treeOpen ? null : button("Show files", "PanelLeftOpen", () => setTreeOpen(true))}
          </View>
        ) : null}
        {treeOpen && layout.compact ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
            <FileBrowser
              theme={theme}
              compact
              workspaceId={workspaceId}
              activePath={active}
              onPick={openPath}
              onClose={tabs.length ? () => setTreeOpen(false) : undefined}
            />
          </View>
        ) : null}
      </View>
      </View>

      {activeTab ? (
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderTopWidth: 1,
            borderTopColor: c.border,
          }}
        >
          <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: 11, flex: 1 }}>
            {activeTab.path}
          </Text>
          <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{activeTab.language.label}</Text>
          {isWeb && activeTab.language.serverId ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11,
                maxWidth: 320,
                color:
                  status?.state === "ready"
                    ? c.statusSuccess
                    : status?.state === "starting" || !status
                      ? c.foregroundMuted
                      : c.statusWarning,
              }}
            >
              {!status
                ? "LSP: waiting"
                : status.state === "ready"
                  ? `${status.serverName}: ready`
                  : status.state === "starting"
                    ? "LSP: starting…"
                    : `${status.serverName}: ${status.reason}`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
