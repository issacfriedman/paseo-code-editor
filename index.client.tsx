import type { PluginClientContext } from "@getpaseo/plugin/client";
import { EditorPanel } from "./client/panel";
import { ExplorerTree, setExplorerClient } from "./client/explorer-tree";
import { EditorSettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  setExplorerClient(client);
  client.addWorkspacePanel({
    id: "editor",
    title: "Code editor",
    icon: "FileCode",
    context: "workspace",
    Component: EditorPanel,
  });
  client.addWorkspacePanel({
    id: "tree",
    title: "Code",
    icon: "FileCode",
    context: "workspace",
    locations: ["explorer"],
    Component: ExplorerTree,
  });
  client.addSettingsScreen({ id: "editor", title: "Code editor", icon: "Type", Component: EditorSettingsScreen });
  client.addCommandCenterItem({
    id: "editor-settings",
    title: "Code editor settings",
    icon: "Type",
    context: "workspace",
    onSelect({ openSettings }) {
      openSettings("editor");
    },
  });
  client.addCommandCenterItem({
    id: "open-editor",
    title: "Open code editor",
    icon: "FileCode",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("editor");
    },
  });
  client.addCommandCenterItem({
    id: "open-tree",
    title: "Show code files in the Files sidebar",
    icon: "FolderTree",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("tree", { location: "explorer" });
    },
  });
  return () => setExplorerClient(null);
}
