import data from '../content/playlists.json';
import { isMood, type Mood } from './playlistLogic';

/** The four running moods, as shipped. */
export const MOODS: Mood[] = (data.moods as unknown[]).filter(isMood);
