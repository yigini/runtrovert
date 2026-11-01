import type { ImportedRunRow } from '../db';
import { sameRun, shapeRun, tallySkips, type ImportTally, type KnownRun } from './shape';
import type { ParseResult, SourceKind } from './types';

// Pure: how parsed runs become saved runs. The database is handed in, so the
// Node tests can check batching, stopping half way and bringing in again.

/**
 * Saves runs a handful at a time, each handful in one transaction. Far fewer
 * trips to the database than one per run (and one per point, as before), and
 * a stop half way loses at most the handful in hand: those come in when the
 * same files are brought in again, and nothing comes in twice.
 */
export class RunSaver {
  private rows: ImportedRunRow[] = [];
  private points = 0;
  private tally: ImportTally;
  private save: (rows: ImportedRunRow[]) => Promise<number[]>;
  private maxRuns: number;
  private maxPoints: number;
  constructor(tally: ImportTally, save: (rows: ImportedRunRow[]) => Promise<number[]>, maxRuns = 25, maxPoints = 60000) {
    this.tally = tally;
    this.save = save;
    this.maxRuns = maxRuns;
    this.maxPoints = maxPoints;
  }

  async add(row: ImportedRunRow): Promise<void> {
    this.rows.push(row);
    this.points += row.points.length + (row.heart?.length ?? 0);
    if (this.rows.length >= this.maxRuns || this.points >= this.maxPoints) await this.flush();
  }

  async flush(): Promise<void> {
    if (!this.rows.length) return;
    const rows = this.rows;
    this.rows = [];
    this.points = 0;
    const ids = await this.save(rows);
    this.tally.added += ids.length;
    this.tally.ids?.push(...ids);
  }
}

/** Brings one file's activities in against `known`, which grows as runs are queued. Call saver.flush() at the end. */
export async function importOne(result: ParseResult, fileName: string | null, kind: SourceKind, known: KnownRun[], tally: ImportTally, saver: RunSaver): Promise<void> {
  tallySkips(result.skipped, tally);
  for (const r of result.runs) {
    const shaped = shapeRun(r);
    if (typeof shaped === 'string') {
      tallySkips([shaped], tally);
      continue;
    }
    if (known.some((k) => sameRun(k, shaped))) {
      tally.duplicate++;
      continue;
    }
    // Heart rate from the file, within the run's own times.
    const heart = (r.heart ?? []).filter((h) => h.ts >= shaped.startedAt && h.ts <= shaped.endedAt).map((h) => [h.ts, h.bpm] as [number, number]);
    known.push({ startedAt: shaped.startedAt, endedAt: shaped.endedAt, distanceM: shaped.distanceM, externalId: shaped.externalId });
    await saver.add({ run: shaped, points: shaped.points, splits: shaped.kmSplits, source: { kind, fileName, externalId: shaped.externalId }, heart });
  }
}

