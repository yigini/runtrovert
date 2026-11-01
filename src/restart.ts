// Start the app's screens again from the database, without closing it: used
// after a backup is restored, so nothing on screen still shows the old data.

const listeners = new Set<() => void>();

export function onRestart(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function restartApp(): void {
  listeners.forEach((l) => l());
}
