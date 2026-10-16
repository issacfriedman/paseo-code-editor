// Lets the Files-sidebar tree hand a file to the editor panel. Both panels share this module
// because they come from the same plugin bundle on the same host.
type Listener = (path: string) => void;

const listeners = new Map<string, Set<Listener>>();
const pending = new Map<string, string[]>();

export function requestOpen(workspaceId: string, path: string) {
  const current = listeners.get(workspaceId);
  if (current?.size) {
    for (const listener of current) listener(path);
    return;
  }
  // No editor yet. It picks this up when it mounts.
  pending.set(workspaceId, [...(pending.get(workspaceId) ?? []), path]);
}

export function subscribeOpen(workspaceId: string, listener: Listener): () => void {
  let set = listeners.get(workspaceId);
  if (!set) listeners.set(workspaceId, (set = new Set()));
  set.add(listener);
  const queued = pending.get(workspaceId);
  if (queued) {
    pending.delete(workspaceId);
    for (const path of queued) listener(path);
  }
  return () => {
    set.delete(listener);
  };
}
