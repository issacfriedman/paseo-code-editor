import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  getAsset,
  listDir,
  listFiles,
  pollLsp,
  readFile,
  sendLsp,
  startLsp,
  statFile,
  stopLsp,
  workspaceRootRpc,
  writeFile,
} from "./shared/contracts";
import { handleDir, handleList, handleRead, handleRoot, handleStat, handleWrite } from "./server/files";
import { handleAsset } from "./server/assets";
import { editorSettings } from "./shared/settings";
import { handlePoll, handleSend, handleStart, handleStop, startReaper } from "./server/lsp";

export default function contribute(server: PluginServerContext) {
  server.handle(listFiles, handleList);
  server.handle(listDir, handleDir);
  server.handle(workspaceRootRpc, handleRoot);
  server.handle(readFile, handleRead);
  server.handle(statFile, handleStat);
  server.handle(writeFile, handleWrite);
  server.handle(startLsp, handleStart);
  server.handle(sendLsp, handleSend);
  server.handle(pollLsp, handlePoll);
  server.handle(stopLsp, handleStop);
  server.handle(getAsset, handleAsset);
  server.registerSettings(editorSettings);
  return startReaper();
}
