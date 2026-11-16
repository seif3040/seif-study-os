import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export default function ActionDialog({ title, onClose, pending = false, children }: {
  title: string; onClose(): void; pending?: boolean; children: ReactNode;
}) {
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent dir="rtl" showCloseButton={!pending} aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
      <DialogTitle>{title}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}
