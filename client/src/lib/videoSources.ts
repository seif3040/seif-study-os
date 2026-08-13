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

export function isDirectMedia(url: string) {
  return /\.(mp4|webm|ogv|ogg)(?:$|[?#])/i.test(url);
}
