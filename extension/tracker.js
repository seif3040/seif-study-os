(() => {
  if (globalThis.seifLessonTracking) return;
  globalThis.seifLessonTracking = true;
  const videos = new Set();
  let last;
  let lastTitle;
  let lastTitleUrl;

  function reportTitle() {
    if (window !== window.top) return;
    const selector = "[data-lesson-title], [data-lecture-title], [itemprop=name]";
    const candidates = [
      ...[...document.querySelectorAll(selector)].map(node => node.getAttribute("data-lesson-title") ||
        node.getAttribute("data-lecture-title") || node.getAttribute("content") ||
        (node.getClientRects().length ? node.textContent : "")),
      ...[...document.querySelectorAll("main h1, article h1, h1, main h2")].filter(node => node.getClientRects().length)
        .map(node => node.textContent),
      document.querySelector('meta[property="og:title"]')?.content,
      document.title,
    ];
    const value = candidates.find(candidate => candidate?.trim() &&
      !/^(صفحة الكورس|الكورسات|المحاضرات|الدرس|المحاضرة|cour(se|ses)|lectures?)$/i.test(candidate.trim())) || "";
    const title = value.replace(/\s+/g, " ").trim().slice(0, 220);
    if (!title || (lastTitle === title && lastTitleUrl === location.href)) return;
    lastTitle = title;
    lastTitleUrl = location.href;
    chrome.runtime.sendMessage({ type: "metadata", title }).catch(() => {});
  }

  function currentVideo() {
    for (const video of videos) if (!video.isConnected) videos.delete(video);
    return [...videos].filter(video => video.readyState > 0 && Number.isFinite(video.duration))
      .sort((a, b) => Number(a.paused) - Number(b.paused) || b.duration - a.duration)[0];
  }

  function sample(discontinuity = false, restarted = false) {
    const video = currentVideo();
    if (!video) return;
    const now = performance.now();
    const position = video.currentTime;
    if (!Number.isFinite(position)) return;
    const url = location.href;
    const seconds = last?.video === video && last.url === url ? (now - last.now) / 1000 : 0;
    const advanced = position - (last?.position ?? position);
    const watched = !discontinuity && !video.seeking && last?.playing && seconds > 0 && seconds <= 5
      && advanced > 0 && advanced <= seconds * video.playbackRate + 0.35;
    // Initial metadata on reload must not replace an existing bookmark with zero.
    const playing = !video.paused && !video.ended && !video.seeking && video.readyState >= 3;
    if ((restarted || position > 0 || playing || (discontinuity && last?.url === url))
        && (restarted || !last || last.video !== video || last.url !== url || Math.abs(advanced) >= 0.1 || discontinuity || last.playing !== playing)) {
      chrome.runtime.sendMessage({ type: "sample", position, playing, restarted, from: watched ? last.position : null,
        seconds: watched ? Math.min(seconds, advanced / video.playbackRate) : 0 }).catch(() => {});
    }
    last = { video, url, now, position, playing };
  }

  function discover() {
    for (const video of document.querySelectorAll("video")) {
      if (videos.has(video)) continue;
      videos.add(video);
      for (const name of ["play", "playing", "pause", "ended", "waiting", "timeupdate", "seeking", "seeked", "ratechange", "loadedmetadata"]) {
        video.addEventListener(name, () => { if (currentVideo() === video && (name !== "timeupdate" || performance.now() - (last?.now ?? 0) >= 650)) sample(name === "seeking" || name === "seeked", name === "play"); });
      }
    }
  }

  reportTitle();
  discover();
  sample();
  setInterval(() => { reportTitle(); discover(); sample(); }, 750);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    discover();
    const video = currentVideo();
    if (message.type === "player" && video) respond({ available: true });
    if (message.type === "seek" && video && Number.isFinite(message.position)) {
      video.currentTime = Math.max(0, Math.min(video.duration, message.position));
      respond({ sought: true });
    }
  });
})();
