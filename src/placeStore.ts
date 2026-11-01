import { getDb, getPoints, listRuns, loadValue, saveValue, touchRuns } from './db';
import { earlierOnLoop, findPlace, HOME_HIDE_MS, homePlace, latestNote, placeOffer, routeSignature, SIG_V, thin, type PlaceOffer, type PlacedVisit, type RoutePt, type RouteSig, type VisitRun } from './places';
import type { Quiet } from './types';

// Your places on this phone: the places table, each place's dated log, and a
// small route signature per run so a finished run can be matched without
// re-reading every fix of every run. Nothing here leaves the phone.

export interface Place {
  id: number;
  name: string;
  tags: string[];
  createdAt: number;
  distanceM: number;
  sig: RouteSig;
}

export interface PlaceVisit extends VisitRun {
  id: number;
  placeId: number;
  runId: number | null;
}

/** What the runner filled in on "Keep this as a place", before the run itself is kept. */
export interface PlaceDraft {
  name: string;
  tags: string[];
}

const DISMISSED_KEY = 'placeDismissed';
const HOME_HIDDEN_KEY = 'placeHomeHidden';
/** Older runs than this many are not looked at for the third-run offer. */
const LOOK_BACK = 250;

function parseSig(s: string | null): RouteSig | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as RouteSig;
    return Array.isArray(v?.pts) ? v : null;
  } catch {
    return null;
  }
}

function rowToPlace(r: any): Place | null {
  const sig = parseSig(r.sig);
  if (!sig) return null;
  let tags: string[] = [];
  try {
    tags = JSON.parse(r.tags);
  } catch {
    // a damaged tag list is just empty
  }
  return { id: r.id, name: r.name, tags, createdAt: r.created_at, distanceM: r.distance_m, sig };
}

// ---- Places ----------------------------------------------------------------------

export async function listPlaces(): Promise<Place[]> {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT p.*, (SELECT MAX(at) FROM place_visits v WHERE v.place_id = p.id) AS last_at
     FROM places p ORDER BY COALESCE(last_at, p.created_at) DESC`,
  );
  return rows.map(rowToPlace).filter((p): p is Place => p != null);
}

export async function getPlace(id: number): Promise<Place | null> {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM places WHERE id = ?', id);
  return row ? rowToPlace(row) : null;
}

export async function updatePlace(id: number, patch: PlaceDraft): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE places SET name = ?, tags = ? WHERE id = ?', patch.name, JSON.stringify(patch.tags), id);
  touchRuns(); // deep stats name places
}

/** Forget a place and its log. The runs themselves stay. */
export async function deletePlace(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM place_visits WHERE place_id = ?', id);
    await db.runAsync('DELETE FROM places WHERE id = ?', id);
  });
  touchRuns();
}

/**
 * Keep a loop as a place, from the run just kept. The earlier runs on the same
 * loop bring their own dated busyness and notes into the log, so the place
 * starts with its history rather than empty.
 */
export async function createPlace(draft: PlaceDraft, sig: RouteSig, runId: number, earlierRunIds: number[]): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO places (name, tags, created_at, distance_m, sig) VALUES (?, ?, ?, ?, ?)',
    draft.name,
    JSON.stringify(draft.tags),
    Date.now(),
    sig.distanceM,
    JSON.stringify(sig),
  );
  const placeId = res.lastInsertRowId;
  for (const id of [runId, ...earlierRunIds]) await logRun(placeId, id);
  return placeId;
}

/** Add a kept run to a place's log, with the busyness and note the runner gave it. Once per run. */
export async function logRun(placeId: number, runId: number): Promise<void> {
  const db = await getDb();
  const run = (await db.getFirstAsync('SELECT started_at, quiet, note FROM runs WHERE id = ?', runId)) as { started_at: number; quiet: Quiet | null; note: string | null } | null;
  if (!run) return;
  const seen = await db.getFirstAsync('SELECT id FROM place_visits WHERE place_id = ? AND run_id = ?', placeId, runId);
  if (seen) return;
  await db.runAsync('INSERT INTO place_visits (place_id, run_id, at, busy, note) VALUES (?, ?, ?, ?, ?)', placeId, runId, run.started_at, run.quiet, run.note);
  touchRuns();
}

/** The dated log, newest first, with each run's distance and time for the summary. */
export async function placeVisits(placeId: number): Promise<PlaceVisit[]> {
  const db = await getDb();
  const rows = (await db.getAllAsync(
    `SELECT v.*, r.distance_m, r.duration_s FROM place_visits v LEFT JOIN runs r ON r.id = v.run_id
     WHERE v.place_id = ? ORDER BY v.at DESC`,
    placeId,
  )) as any[];
  return rows.map((r) => ({ id: r.id, placeId: r.place_id, runId: r.run_id, at: r.at, busy: r.busy, note: r.note, distanceM: r.distance_m ?? undefined, durationS: r.duration_s ?? undefined }));
}

/** The last few notes per place, for the list. */
export async function recentVisits(perPlace = 6): Promise<Map<number, PlaceVisit[]>> {
  const db = await getDb();
  const rows = (await db.getAllAsync('SELECT * FROM place_visits ORDER BY at DESC')) as any[];
  const out = new Map<number, PlaceVisit[]>();
  for (const r of rows) {
    const list = out.get(r.place_id) ?? [];
    if (list.length < perPlace) list.push({ id: r.id, placeId: r.place_id, runId: r.run_id, at: r.at, busy: r.busy, note: r.note });
    out.set(r.place_id, list);
  }
  return out;
}

/** The place a run is logged in, if any (for a run's own page). */
export async function placeForRun(runId: number): Promise<Place | null> {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT p.* FROM places p JOIN place_visits v ON v.place_id = p.id WHERE v.run_id = ? LIMIT 1', runId);
  return row ? rowToPlace(row) : null;
}

// ---- Route signatures ------------------------------------------------------------

export async function saveSig(runId: number, sig: RouteSig | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO route_sigs (run_id, v, sig) VALUES (?, ?, ?)', runId, SIG_V, sig ? JSON.stringify(sig) : null);
}

/**
 * Signatures of recent kept runs, working out (once) any that are missing:
 * runs from before this feature, or kept while it was off.
 */
async function pastSigs(exceptRunId: number | null): Promise<Array<{ runId: number; sig: RouteSig }>> {
  const db = await getDb();
  const runs = (await listRuns()).filter((r) => r.id !== exceptRunId).slice(0, LOOK_BACK);
  const rows = (await db.getAllAsync('SELECT run_id, v, sig FROM route_sigs')) as Array<{ run_id: number; v: number; sig: string | null }>;
  const have = new Map(rows.filter((r) => r.v === SIG_V).map((r) => [r.run_id, parseSig(r.sig)]));
  const out: Array<{ runId: number; sig: RouteSig }> = [];
  let worked = 0;
  for (const r of runs) {
    let sig = have.get(r.id);
    if (sig === undefined) {
      const pts = await getPoints(r.id);
      sig = routeSignature(pts);
      await saveSig(r.id, sig);
      // After an import hundreds can be missing: a breath every few, so the screen keeps drawing.
      if (++worked % 4 === 0) await breath();
    }
    if (sig) out.push({ runId: r.id, sig });
  }
  return out;
}

const breath = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Work out, ahead of time and a few at a time, the loops of runs that have none yet (runs brought in from files). */
export async function warmSigs(): Promise<void> {
  await pastSigs(null);
}

export interface FinishPlace {
  sig: RouteSig | null;
  offer: PlaceOffer;
  place: Place | null;
  /** Earlier runs on the same loop, so a place kept from any run starts with its history. */
  earlier: number[];
}

/** What the finish screen says about where you ran: a known place, the third-run offer, or nothing. */
export async function finishPlace(runId: number | null, points: RoutePt[]): Promise<FinishPlace> {
  const sig = routeSignature(points);
  if (!sig) return { sig, offer: { kind: 'none' }, place: null, earlier: [] };
  const [places, past, dismissed] = await Promise.all([listPlaces(), pastSigs(runId), loadValue<RouteSig[]>(DISMISSED_KEY)]);
  const offer = placeOffer(sig, past, places, dismissed ?? []);
  const place = offer.kind === 'place' ? (places.find((p) => p.id === offer.placeId) ?? null) : null;
  const earlier = offer.kind === 'offer' ? offer.earlier : offer.kind === 'none' ? earlierOnLoop(sig, past) : [];
  return { sig, offer, place, earlier };
}

/** "Not now": this loop is never offered again. */
export async function dismissLoop(sig: RouteSig): Promise<void> {
  const list = (await loadValue<RouteSig[]>(DISMISSED_KEY).catch(() => null)) ?? [];
  await saveValue(DISMISSED_KEY, [...list.slice(-49), thin(sig)]);
}

// ---- Any run can become a place ---------------------------------------------------

export interface RunPlaceChoice {
  sig: RouteSig;
  /** A place this run's loop already is, though the run isn't in its log yet. */
  match: Place | null;
}

/**
 * For a kept run that isn't in a place's log: its loop, and the place it
 * already matches, if one does. Null when there's no route to keep (too short,
 * or no GPS).
 */
export async function runPlaceChoice(runId: number): Promise<RunPlaceChoice | null> {
  const db = await getDb();
  const row = (await db.getFirstAsync('SELECT v, sig FROM route_sigs WHERE run_id = ?', runId)) as { v: number; sig: string | null } | null;
  let sig = row && row.v === SIG_V ? parseSig(row.sig) : undefined;
  if (sig === undefined) {
    sig = routeSignature(await getPoints(runId));
    await saveSig(runId, sig);
  }
  if (!sig) return null;
  const places = await listPlaces();
  const id = findPlace(sig, places);
  return { sig, match: id != null ? (places.find((p) => p.id === id) ?? null) : null };
}

/** "Save as a place" from a run's own page. Earlier runs on the loop come into its log too. */
export async function placeFromRun(runId: number, draft: PlaceDraft, sig: RouteSig): Promise<number> {
  const earlier = earlierOnLoop(sig, await pastSigs(runId));
  return createPlace(draft, sig, runId, earlier);
}

// ---- One place on the home screen ---------------------------------------------------

export interface HomePlace {
  place: Place;
  /** The runner's own latest note there, if they've written one. */
  note: { at: number; note: string } | null;
}

export async function homePlaceCard(now = Date.now()): Promise<HomePlace | null> {
  const db = await getDb();
  const [places, rows, hidden] = await Promise.all([
    listPlaces(),
    db.getAllAsync('SELECT place_id, at, busy, note FROM place_visits') as Promise<any[]>,
    loadValue<Record<number, number>>(HOME_HIDDEN_KEY).catch(() => null),
  ]);
  if (!places.length) return null;
  const visits: PlacedVisit[] = rows.map((r) => ({ placeId: r.place_id, at: r.at, busy: r.busy, note: r.note }));
  const id = homePlace(
    places.map((p) => p.id),
    visits,
    now,
    hidden ?? {},
  );
  const place = id != null ? places.find((p) => p.id === id) : null;
  if (!place) return null;
  const last = latestNote(visits.filter((v) => v.placeId === id));
  return { place, note: last ? { at: last.at, note: last.note!.trim() } : null };
}

/** "Hide": this place stays off the home screen for a week. */
export async function hideHomePlace(placeId: number, now = Date.now()): Promise<void> {
  const cur = (await loadValue<Record<number, number>>(HOME_HIDDEN_KEY).catch(() => null)) ?? {};
  const keep: Record<number, number> = {};
  for (const [k, until] of Object.entries(cur)) if (until > now) keep[Number(k)] = until;
  keep[placeId] = now + HOME_HIDE_MS;
  await saveValue(HOME_HIDDEN_KEY, keep);
}
