(() => {
  if (globalThis.seifLessonTracking) return;
  globalThis.seifLessonTracking = true;
  const videos = new Set();
  let last;

  function currentVideo() {
    for (const video of videos) if (!video.isConnected) videos.delete(video);
    return [...videos].filter(video => video.readyState > 0 && Number.isFinite(video.duration))
      .sort((a, b) => Number(a.paused) - Number(b.paused) || b.duration - a.duration)[0];
  }

  function sample(discontinuity = false) {
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
    if ((position > 0 || playing || (discontinuity && last?.url === url))
        && (!last || last.video !== video || last.url !== url || Math.abs(advanced) >= 0.1 || discontinuity || last.playing !== playing)) {
      chrome.runtime.sendMessage({ type: "sample", position, playing, from: watched ? last.position : null,
        seconds: watched ? Math.min(seconds, advanced / video.playbackRate) : 0 }).catch(() => {});
    }
    last = { video, url, now, position, playing };
  }

  function discover() {
    for (const video of document.querySelectorAll("video")) {
      if (videos.has(video)) continue;
      videos.add(video);
      for (const name of ["playing", "pause", "ended", "waiting", "timeupdate", "seeking", "seeked", "ratechange", "loadedmetadata"]) {
        video.addEventListener(name, () => { if (currentVideo() === video && (name !== "timeupdate" || performance.now() - (last?.now ?? 0) >= 650)) sample(name === "seeking" || name === "seeked"); });
      }
    }
  }

  discover();
  sample();
  setInterval(() => { discover(); sample(); }, 750);
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
