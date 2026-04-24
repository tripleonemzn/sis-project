export function buildDailyPresenceChallengeCode(secret: string, windowIndex: number) {
  const input = `${secret}:${windowIndex}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) % 1000000;
  return String(normalized).padStart(6, '0');
}

export function getDailyPresenceChallengeWindowIndex(date = new Date(), windowSeconds = 30) {
  return Math.floor(date.getTime() / (windowSeconds * 1000));
}

export function getDailyPresenceChallengeWindowEndsAt(date = new Date(), windowSeconds = 30) {
  const currentWindow = getDailyPresenceChallengeWindowIndex(date, windowSeconds);
  return new Date((currentWindow + 1) * windowSeconds * 1000);
}

export function getDailyPresenceCheckpointLabel(checkpoint: 'CHECK_IN' | 'CHECK_OUT') {
  return checkpoint === 'CHECK_IN' ? 'Masuk' : 'Pulang';
}

export function formatCountdownLabel(targetDateIso?: string | null) {
  if (!targetDateIso) return '--:--';
  const diffMs = new Date(targetDateIso).getTime() - Date.now();
  if (diffMs <= 0) return '00:00';
  const totalSeconds = Math.ceil(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
