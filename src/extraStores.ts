// The weekly goal and Tell someone, each under its own key (valueStore.ts).
import { cleanGoal, type WeekGoal } from './weekGoal';
import { cleanTell, type Tell } from './tellSomeone';
import { valueStore } from './valueStore';

export const goalStore = valueStore<WeekGoal>('weekGoal', cleanGoal);
export const tellStore = valueStore<Tell>('tellSomeone', cleanTell);
