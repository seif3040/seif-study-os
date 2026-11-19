export type StudySourceKind = "embedded" | "external" | "invalid";

export function safeStudyUrl(url: string) {
  try { const parsed = new URL(url.trim()); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null; } catch { return null; }
}

export function youtubeEmbed(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "");
    let id = "";
    if (host === "youtu.be") id = parsed.pathname.slice(1);
    else if (host === "youtube.com" || host === "m.youtube.com") id = parsed.searchParams.get("v") ?? parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` : null;
  } catch { return null; }
}

export function isDirectMedia(url: string) { return /\.(mp4|webm|ogv|ogg)(?:$|[?#])/i.test(url); }
export function classifyStudySource(url: string): StudySourceKind { const safe = safeStudyUrl(url); if (!safe) return "invalid"; return youtubeEmbed(safe) || isDirectMedia(safe) ? "embedded" : "external"; }
export function sourceDomain(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "المصدر الخارجي"; } }

export function platformFrameUrl(url: string, parentOrigin: string) {
  const safe = safeStudyUrl(url);
  if (!safe) return null;
  const parsed = new URL(safe);
  const host = parsed.hostname.replace(/^www\./, "");
  // The course serves X-Frame-Options: SAMEORIGIN.
  if (host === "codingwithghonaim.com" || host.endsWith(".codingwithghonaim.com")) return null;
  if (parsed.protocol !== "https:" || parsed.origin === parentOrigin || parsed.username || parsed.password) return null;
  return youtubeEmbed(parsed.href) ?? parsed.href;
}
