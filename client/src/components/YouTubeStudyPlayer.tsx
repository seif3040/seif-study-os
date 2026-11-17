import { useEffect, useRef, useState } from "react";

type Player = { getCurrentTime(): number; getPlaybackRate(): number; destroy(): void };
type PlayerEvent = { target: Player; data: number };
type YouTubeAPI = { Player: new (frame: HTMLIFrameElement, options: {
  events: { onReady(event: { target: Player }): void; onStateChange(event: PlayerEvent): void; onError(): void };
}) => Player };
type YouTubeWindow = Window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void };

let apiPromise: Promise<YouTubeAPI> | undefined;
function loadYouTube() {
  const youtube = window as YouTubeWindow;
  if (youtube.YT?.Player) return Promise.resolve(youtube.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
      const script = document.createElement("script");
      const previous = youtube.onYouTubeIframeAPIReady;
      function finish() {
        window.clearTimeout(timeout);
        youtube.onYouTubeIframeAPIReady = previous;
      }
      const fail = () => { finish(); script.remove(); reject(new Error("YouTube player API unavailable")); };
      const timeout = window.setTimeout(fail, 15_000);
      youtube.onYouTubeIframeAPIReady = () => {
        const api = youtube.YT;
        if (!api?.Player) { fail(); return; }
        finish();
        resolve(api);
        previous?.();
      };
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = fail;
      document.head.append(script);
    }).catch(error => { apiPromise = undefined; throw error; });
  }
  return apiPromise;
}

export function YouTubeStudyPlayer({ embed, startAt = 0, autoPlay = false, onPlaying, onStopped, onPosition, onEnded }: {
  embed: string;
  startAt?: number;
  autoPlay?: boolean;
  onPlaying(readPosition: () => number, readRate: () => number): void;
  onStopped(position?: number): void;
  onPosition(position: number): void;
  onEnded(): void;
}) {
  const initialPosition = useRef(startAt);
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onPlaying, onStopped, onPosition, onEnded });
  callbacks.current = { onPlaying, onStopped, onPosition, onEnded };
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let player: Player | undefined;
    let playing = false;
    let ready = false;
    let waitingForStart = initialPosition.current > 0;
    const readPosition = (source: Player) => {
      const position = source.getCurrentTime();
      if (waitingForStart && position > 0) waitingForStart = false;
      return waitingForStart ? initialPosition.current : position;
    };
    const refreshPosition = (source = player) => {
      if (!ready) return;
      const position = source && readPosition(source);
      if (typeof position === "number" && Number.isFinite(position)) callbacks.current.onPosition(position);
    };
    const interval = window.setInterval(() => refreshPosition(), 200);
    const url = new URL(embed);
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", window.location.origin);
    url.searchParams.set("playsinline", "1");
    if (autoPlay) url.searchParams.set("autoplay", "1");
    if (initialPosition.current > 0) url.searchParams.set("start", String(initialPosition.current));
    const frame = document.createElement("iframe");
    frame.title = "فيديو المذاكرة على يوتيوب";
    frame.className = "h-full w-full";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    const stop = (position?: number) => {
      if (!playing) return;
      playing = false;
      callbacks.current.onStopped(position);
    };
    void loadYouTube().then(api => {
      if (disposed) return;
      frame.src = url.toString();
      container.append(frame);
      player = new api.Player(frame, { events: {
        onReady(event) {
          if (disposed) return;
          ready = true;
          refreshPosition(event.target);
        },
        onStateChange(event) {
          if (disposed) return;
          ready = true;
          refreshPosition(event.target);
          if (event.data === 1) {
            playing = true;
            callbacks.current.onPlaying(() => readPosition(event.target), () => event.target.getPlaybackRate());
          } else {
            stop(readPosition(event.target));
            if (event.data === 0) callbacks.current.onEnded();
          }
        },
        onError() { if (!disposed) { stop(); setError(true); } },
      } });
    }).catch(() => {
      if (disposed) return;
      setError(true);
      frame.src = url.toString();
      container.append(frame);
    });
    return () => {
      disposed = true;
      window.clearInterval(interval);
      stop(ready && player ? readPosition(player) : undefined);
      player?.destroy();
      frame.remove();
    };
  }, [embed, autoPlay]);
  return <>
    <div className="aspect-video bg-black" ref={host} />
    {error && <p className="p-3 text-sm text-muted-foreground" role="status">تعذّر ربط عدّاد يوتيوب. جرّب تحديث الصفحة.</p>}
  </>;
}
