import { createHash } from "node:crypto";

const chapterLengths = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,
  35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,
  28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,
  19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
];
const totalVerses = chapterLengths.reduce((sum, length) => sum + length, 0);
type Verse = { surah: number; ayah: number; text: string; explanation: string; source: string };
const cache = new Map<string, Promise<Verse>>();

export function dailyVerseReference(userId: number, day: string) {
  let index = createHash("sha256").update(JSON.stringify([day, userId])).digest().readUInt32BE() % totalVerses;
  const surah = chapterLengths.findIndex(length => {
    if (index < length) return true;
    index -= length;
    return false;
  }) + 1;
  return { surah, ayah: index + 1 };
}

export function dailyQuranVerse(userId: number, day: string) {
  const { surah, ayah } = dailyVerseReference(userId, day);
  const key = surah + ":" + ayah;
  const previous = cache.get(key);
  if (previous) return previous;
  const promise = (async () => {
    const response = await fetch("https://quranenc.com/api/v1/translation/aya/arabic_moyassar/" + surah + "/" + ayah,
      { signal: AbortSignal.timeout(6500) });
    if (!response.ok) throw new Error("تعذّر تحميل آية اليوم.");
    const { result } = await response.json();
    if (Number(result?.sura) !== surah || Number(result?.aya) !== ayah ||
      typeof result.arabic_text !== "string" || typeof result.translation !== "string") {
      throw new Error("تعذّر تحميل آية اليوم.");
    }
    return { surah, ayah, text: result.arabic_text, explanation: result.translation,
      source: "https://quranenc.com/ar/browse/arabic_moyassar/" + surah + "-" + ayah };
  })().catch(error => { cache.delete(key); throw error; });
  if (cache.size >= 128) cache.clear();
  cache.set(key, promise);
  return promise;
}
