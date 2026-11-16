export const videoBlockSeconds = 45 * 60;

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
