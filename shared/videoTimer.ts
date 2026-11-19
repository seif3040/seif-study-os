export const videoBlockSeconds = 45 * 60;

export function videoRemainderReward(activeSeconds: number, completedBlocks: number, blockReward: number) {
  const remainder = Math.max(0, activeSeconds - completedBlocks * videoBlockSeconds);
  return Math.round(blockReward * Math.min(remainder, videoBlockSeconds) / videoBlockSeconds);
}

export function externalVideoWithElapsed(activeSeconds: number, completedBlocks: number, elapsedMinutes: number) {
  const seconds = activeSeconds + elapsedMinutes * 60;
  if (!Number.isSafeInteger(seconds) || seconds > 2_147_483_647) throw new Error("راجع مدة المذاكرة المكتوبة.");
  return { activeSeconds: seconds, completedBlocks: Math.max(completedBlocks, Math.floor(seconds / videoBlockSeconds)) };
}

type ExternalTimer = {
  activeSeconds: number;
  completedBlocks: number;
  timerRunning: boolean;
  lastPlaybackAt: Date | null;
};

export function externalVideoDeadline(session: ExternalTimer) {
  if (!session.timerRunning || !session.lastPlaybackAt) return null;
  const remaining = Math.max(0, (session.completedBlocks + 1) * videoBlockSeconds - session.activeSeconds);
  return +session.lastPlaybackAt + remaining * 1000;
}

export function externalVideoElapsed(session: ExternalTimer, now: number) {
  const deadline = externalVideoDeadline(session);
  if (deadline === null || !session.lastPlaybackAt) return session.activeSeconds;
  return session.activeSeconds + Math.max(0, Math.floor((Math.min(now, deadline) - +session.lastPlaybackAt) / 1000));
}
