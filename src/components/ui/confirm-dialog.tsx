"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Branded, accessible confirm modal — replaces window.confirm. Controlled via `open`.
 * Esc / backdrop click / Cancel all dismiss; the confirm button is auto-focused.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="animate-in fixed inset-0 z-50 flex items-center justify-center p-4 duration-150 fade-in"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
      />
      <div className="animate-in relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl duration-200 zoom-in-95">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              destructive ? "bg-red-100 text-red-700" : "bg-muted text-brand-sage",
            )}
          >
            <AlertTriangle className="size-4.5" />
          </span>
          <div className="space-y-1">
            <h2 id="confirm-title" className="font-display text-lg font-semibold text-brand">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-md border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "h-9 rounded-md px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50",
              destructive ? "bg-red-600" : "bg-brand",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
