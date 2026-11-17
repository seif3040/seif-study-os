export function lessonKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const identifiers = new URLSearchParams();
    for (const name of ["id", "video", "videoId", "lesson", "lessonId", "section", "course", "v"]) {
      const value = url.searchParams.get(name);
      if (value && /^[a-z0-9_-]{1,80}$/i.test(value)) identifiers.set(name, value);
    }
    return url.origin + url.pathname.replace(/\/$/, "") + (identifiers.size ? "?" + identifiers : "");
  } catch {
    return null;
  }
}

export function addWatchedRange(ranges, start, end) {
  if (!(end > start)) return ranges;
  const merged = [];
  for (const [from, to] of [...ranges, [start, end]].sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to);
    else merged.push([from, to]);
  }
  return merged;
}
