export const focusPresets = [15, 25, 45, 60] as const;
export function isFocusPreset(minutes: number): minutes is typeof focusPresets[number] {
  return focusPresets.some(preset => preset === minutes);
}
export function focusReward(minutes: number, rate: number) {
  return isFocusPreset(minutes) ? rate : Math.floor(minutes * rate / 60);
}
