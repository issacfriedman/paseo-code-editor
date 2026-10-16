import { useState } from "react";
import type { PluginClientContext, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { FileBrowser } from "./file-browser";
import { requestOpen } from "./open-requests";

let client: PluginClientContext | null = null;

export function setExplorerClient(value: PluginClientContext | null) {
  client = value;
}

// The "Code" tab in the Files sidebar. Tapping a file opens it in the Code editor panel.
export function ExplorerTree({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <FileBrowser
      theme={theme}
      compact={layout.compact}
      workspaceId={workspaceId}
      activePath={active}
      onPick={(path) => {
        setActive(path);
        requestOpen(workspaceId, path);
        client?.openPanel("editor", { workspaceId });
      }}
    />
  );
}
