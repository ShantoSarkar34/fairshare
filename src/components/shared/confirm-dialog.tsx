"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Extra content, e.g. a "type the name to confirm" input. */
  children?: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  pending?: boolean;
  onConfirm: () => void;
};

/**
 * Modal confirmation built on the native <dialog> element, which gives us
 * a focus trap, Escape to close and an inert page behind it for free.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  confirmDisabled = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Fires after the dialog closes by any route (Escape, close()).
      onClose={() => onOpenChange(false)}
      // Do not let Escape close the dialog while a request is running.
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      // A click on the backdrop targets the <dialog> element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onOpenChange(false);
        }
      }}
      className="m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50"
    >
      {open && (
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <div className="text-sm text-muted-foreground">{description}</div>
          </div>

          {children}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={confirmDisabled || pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
