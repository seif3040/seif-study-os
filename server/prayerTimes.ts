export const prayerNames = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" } as const;
export type Prayer = keyof typeof prayerNames;
export const prayers = Object.keys(prayerNames) as Prayer[];

const cache = new Map<string, Promise<Record<Prayer, string>>>();

export function cairoPrayers(day: string) {
  const cached = cache.get(day);
  if (cached) return cached;
  const date = day.split("-").reverse().join("-");
  const url = "https://api.aladhan.com/v1/timingsByCity/" + date + "?city=Cairo&country=Egypt&method=5";
  const pending = fetch(url, { signal: AbortSignal.timeout(4500) }).then(async response => {
    if (!response.ok) throw new Error("تعذّر تحميل مواقيت الصلاة.");
    const { data } = await response.json();
    const times = {} as Record<Prayer, string>;
    for (const prayer of prayers) {
      const value = data?.timings?.[prayer];
      if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        throw new Error("مواقيت الصلاة مش متاحة دلوقتي.");
      }
      times[prayer] = value;
    }
    return times;
  }).catch(error => { cache.delete(day); throw error; });
  if (cache.size >= 14) cache.clear();
  cache.set(day, pending);
  return pending;
}
