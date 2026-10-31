import { Directory, File, Paths } from 'expo-file-system';
import { coverFileName, coverQueue } from './coverLogic';

// Covers that didn't ship with the app, kept on the phone once fetched. Each one
// is asked for once, as plain GET of art/<id>.jpg: no cookie, no query string,
// no id. After that the shelves draw it from this folder, offline too, and
// nothing goes out again for that show. About 11 KB each, so even every show on
// every shelf stays near 2 MB. Covers of shows that left the list are dropped.

const dir = new Directory(Paths.document, 'covers');
let known: Set<string> | null = null;
const queue = coverQueue(3);

function ensure(): Set<string> {
  if (known) return known;
  known = new Set();
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    for (const f of dir.list()) if (f instanceof File && f.name.endsWith('.jpg')) known.add(f.name);
  } catch {
    // No folder, no cache: covers just come from the network each time.
  }
  return known;
}

/** The kept file for this show, or null. Never touches the network. */
export function keptCover(id: number): string | null {
  const name = coverFileName(id);
  return ensure().has(name) ? new File(dir, name).uri : null;
}

/** Fetch a show's cover once and keep it. Resolves to the file's uri, or null when offline or missing. */
export function fetchCover(id: number, url: string): Promise<string | null> {
  const name = coverFileName(id);
  const have = keptCover(id);
  if (have) return Promise.resolve(have);
  return queue(name, async () => {
    const part = new File(dir, `${name}.part`);
    try {
      if (part.exists) part.delete();
      const got = await File.downloadFileAsync(url, part, { idempotent: true });
      if (!got.exists || (got.size ?? 0) < 200) {
        got.delete();
        return null;
      }
      const final = new File(dir, name);
      if (final.exists) final.delete();
      got.move(final);
      ensure().add(name);
      return final.uri;
    } catch {
      try {
        if (part.exists) part.delete();
      } catch {}
      return null;
    }
  });
}

/** Drop kept covers for shows no longer on any shelf. */
export function pruneCovers(keepIds: Iterable<number>): void {
  const keep = new Set([...keepIds].map(coverFileName));
  try {
    for (const name of [...ensure()]) {
      if (keep.has(name)) continue;
      new File(dir, name).delete();
      known?.delete(name);
    }
  } catch {}
}
