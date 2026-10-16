import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { listDir, listFiles } from "../shared/contracts";

type Entry = { name: string; dir: boolean };
type DirState = { entries: Entry[] } | { error: string } | "loading";
type Row = { path: string; name: string; dir: boolean; depth: number };

type Props = {
  theme: PluginTheme;
  compact: boolean;
  workspaceId: string;
  activePath: string | null;
  onPick(path: string): void;
  onClose?(): void;
};

const SEARCH_LIMIT = 200;

function score(path: string, query: string): number {
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (lower.includes(query)) return 3;
  return -1;
}

// A folder tree like Paseo's Files tab. Folders load one level at a time; search is optional.
export function FileBrowser({ theme, compact, workspaceId, activePath, onPick, onClose }: Props) {
  const dirRpc = useRpc(listDir);
  const listRpc = useRpc(listFiles);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<string[] | null>(null);

  const load = useCallback(
    (path: string) => {
      setDirs((d) => ({ ...d, [path]: "loading" }));
      dirRpc({ workspaceId, path }).then(
        (result) => setDirs((d) => ({ ...d, [path]: { entries: result.entries } })),
        (error) => setDirs((d) => ({ ...d, [path]: { error: String(error) } })),
      );
    },
    [dirRpc, workspaceId],
  );

  useEffect(() => {
    load("");
  }, [load]);

  // Open the folders that lead to the active file, so it is visible in the tree.
  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split("/").slice(0, -1);
    let prefix = "";
    const open: Record<string, boolean> = {};
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      open[prefix] = true;
    }
    setExpanded((e) => ({ ...e, ...open }));
  }, [activePath]);

  useEffect(() => {
    for (const path of Object.keys(expanded)) if (expanded[path] && !dirs[path]) load(path);
  }, [expanded, dirs, load]);

  const searching = query.trim().length > 0;
  useEffect(() => {
    if (!searching || allFiles) return;
    listRpc({ workspaceId }).then(
      (result) => setAllFiles(result.files),
      () => setAllFiles([]),
    );
  }, [searching, allFiles, listRpc, workspaceId]);

  const rows = useMemo(() => {
    if (searching) {
      const q = query.trim().toLowerCase();
      const scored: { path: string; s: number }[] = [];
      for (const path of allFiles ?? []) {
        const s = score(path, q);
        if (s >= 0) scored.push({ path, s });
      }
      scored.sort((a, b) => a.s - b.s || a.path.length - b.path.length);
      return scored.slice(0, SEARCH_LIMIT).map(({ path }): Row => ({ path, name: path, dir: false, depth: 0 }));
    }
    const out: Row[] = [];
    const walk = (path: string, depth: number) => {
      const state = dirs[path];
      if (!state || state === "loading" || "error" in state) return;
      for (const entry of state.entries) {
        const child = path ? `${path}/${entry.name}` : entry.name;
        out.push({ path: child, name: entry.name, dir: entry.dir, depth });
        if (entry.dir && expanded[child]) walk(child, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [searching, query, allFiles, dirs, expanded]);

  const c = theme.colors;
  const rootState = dirs[""];
  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center", padding: compact ? 8 : 10 }}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Filter by name"
          placeholderTextColor={c.foregroundMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => rows[0] && !rows[0].dir && onPick(rows[0].path)}
          style={{
            flex: 1,
            color: c.foreground,
            backgroundColor: c.surface2,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            fontSize: 13,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh files"
          onPress={() => {
            setDirs({});
            setAllFiles(null);
          }}
          style={{ padding: 6 }}
        >
          <Icon name="RefreshCw" size={14} color={c.foregroundMuted} />
        </Pressable>
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close files" onPress={onClose} style={{ padding: 6 }}>
            <Icon name="X" size={16} color={c.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>
      {rootState && rootState !== "loading" && "error" in rootState ? (
        <Text style={{ color: c.statusDanger, paddingHorizontal: 12 }}>{rootState.error}</Text>
      ) : null}
      {(!rootState || rootState === "loading") && !searching ? (
        <Text style={{ color: c.foregroundMuted, paddingHorizontal: 12 }}>Loading…</Text>
      ) : null}
      {searching && !allFiles ? (
        <Text style={{ color: c.foregroundMuted, paddingHorizontal: 12 }}>Searching…</Text>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.path}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const open = item.dir && expanded[item.path];
          const active = item.path === activePath;
          const loading = item.dir && open && dirs[item.path] === "loading";
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.path}
              onPress={() => {
                if (item.dir) setExpanded((e) => ({ ...e, [item.path]: !e[item.path] }));
                else onPick(item.path);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: compact ? 7 : 4,
                paddingRight: 8,
                paddingLeft: 10 + item.depth * 14,
                backgroundColor: active ? c.surface2 : pressed ? c.surface1 : "transparent",
              })}
            >
              <Icon
                name={item.dir ? (open ? "ChevronDown" : "ChevronRight") : "File"}
                size={13}
                color={c.foregroundMuted}
              />
              <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 13, flex: 1 }}>
                {item.name}
              </Text>
              {loading ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>…</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
