import { plannerMinutes } from "./studyPlanner.js";

export type SleepLog = { bed: string; wake: string };

export function sleepDuration({ bed, wake }: SleepLog) {
  return (plannerMinutes(wake) - plannerMinutes(bed) + 1440) % 1440;
}

export const sleepTargetMinutes = 7 * 60;
