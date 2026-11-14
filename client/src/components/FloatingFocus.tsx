import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FloatingFocus({ seconds, status, action, secondary, round }: {
  seconds: number; status: string; round?: string;
  secondary?: { label: string; disabled: boolean; run: () => void };
  action: { label: string; disabled: boolean; run: () => void };
}) {
  const api = (window as Window & { documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> } }).documentPictureInPicture;
  const [popup, setPopup] = useState<Window>();
  useEffect(() => {
    if (!popup) return;
    const close = () => setPopup(undefined);
    popup.addEventListener("pagehide", close, { once: true });
    return () => { popup.removeEventListener("pagehide", close); popup.close(); };
  }, [popup]);
  if (!api) return null;
  return <>
    <Button size="sm" variant="outline" className="mt-3" onClick={async () => {
      if (popup && !popup.closed) { popup.focus(); return; }
      try {
        const next = await api.requestWindow({ width: 320, height: 275 });
        next.document.title = "مؤقت المذاكرة";
        next.document.body.dir = "rtl";
        next.document.body.style.cssText = "margin:0;background:#12201d;color:white;font:16px system-ui;text-align:center";
        setPopup(next);
      } catch { toast.error("تعذّر فتح النافذة العائمة."); }
    }}>مؤقت في نافذة عائمة</Button>
    {popup && !popup.closed && createPortal(<div style={{ padding: 16 }}>
      <div role="status">{status}{round && " · جولة " + round}</div>
      <strong dir="ltr" style={{ display: "block", fontSize: 38 }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong>
      <button type="button" disabled={action.disabled} onClick={action.run}
        style={{ marginTop: 12, padding: "8px 16px", border: 0, borderRadius: 10, font: "inherit",
          background: "#bef264", color: "#16210d", opacity: action.disabled ? .55 : 1,
          cursor: action.disabled ? "default" : "pointer" }}>{action.label}</button>
      {secondary && <button type="button" disabled={secondary.disabled} onClick={secondary.run}
        style={{ display: "block", margin: "8px auto 0", padding: "6px 10px", borderRadius: 8,
          border: "1px solid #aac2b5", background: "transparent", color: "white", font: "inherit" }}>{secondary.label}</button>}
    </div>, popup.document.body)}
  </>;
}
