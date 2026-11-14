import { useEffect, useRef, useState } from "react";

type Player = { getCurrentTime(): number; getPlaybackRate(): number; destroy(): void };
type PlayerEvent = { target: Player; data: number };
type YouTubeAPI = { Player: new (frame: HTMLIFrameElement, options: {
  events: { onStateChange(event: PlayerEvent): void; onError(): void };
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

export function YouTubeStudyPlayer({ embed, onPlaying, onStopped, onPosition }: {
  embed: string;
  onPlaying(readPosition: () => number, readRate: () => number): void;
  onStopped(position?: number): void;
  onPosition(position: number): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onPlaying, onStopped, onPosition });
  callbacks.current = { onPlaying, onStopped };
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let player: Player | undefined;
    let playing = false;
    const refreshPosition = () => {
      const position = player?.getCurrentTime?.();
      if (typeof position === "number" && Number.isFinite(position)) callbacks.current.onPosition(position);
    };
    const interval = window.setInterval(refreshPosition, 200);
    const url = new URL(embed);
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", window.location.origin);
    url.searchParams.set("playsinline", "1");
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
        onStateChange(event) {
          if (disposed) return;
          refreshPosition();
          if (event.data === 1) {
            playing = true;
            callbacks.current.onPlaying(() => event.target.getCurrentTime(), () => event.target.getPlaybackRate());
          } else stop(event.target.getCurrentTime());
        },
        onError() { if (!disposed) { stop(); setError(true); } },
      } });
    }).catch(() => {
      if (disposed) return;
      setError(true);
      frame.src = embed;
      container.append(frame);
    });
    return () => {
      disposed = true;
      window.clearInterval(interval);
      stop(player?.getCurrentTime());
      player?.destroy();
      frame.remove();
    };
  }, [embed]);
  return <>
    <div className="aspect-video bg-black" ref={host} />
    {error && <p className="p-3 text-sm text-muted-foreground" role="status">تعذّر ربط عدّاد يوتيوب. جرّب تحديث الصفحة.</p>}
  </>;
}
