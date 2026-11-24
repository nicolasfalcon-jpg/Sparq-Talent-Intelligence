"use client";
/**
 * Overlays built on Radix Dialog (focus trap, Escape, aria) with Sparq styling:
 * - Drawer: right-side panel inset 16px, radius 32, overlay rgba(24,25,27,.24) — opportunity details, edit profile.
 * - Modal: centered, radius 36 — passport preview & export.
 * - Toast: top-center ink capsule with role="status".
 */
import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { useEffect, type ReactNode } from "react";

export function Drawer({ open, onOpenChange, title, description, width = 540, children, footer, header }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; width?: number;
  children: ReactNode; footer?: ReactNode; header?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[58] bg-[rgba(24,25,27,.24)]" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className="fixed top-4 right-4 bottom-4 z-[60] flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-panel bg-surface shadow-drawer focus:outline-none"
          style={{ width }}
        >
          <Dialog.Title className="sr-only-v">{title}</Dialog.Title>
          {description ? <Dialog.Description className="sr-only-v">{description}</Dialog.Description> : <Dialog.Description className="sr-only-v">{title}</Dialog.Description>}
          {header}
          <div className="flex flex-1 flex-col gap-6 overflow-auto px-[30px] py-[22px]">{children}</div>
          {footer && <div className="flex gap-2 px-[30px] pt-[18px] pb-7">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({ open, onOpenChange, title, children, className }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[58] bg-black/30" />
        <Dialog.Content
          className={clsx("fixed top-1/2 left-1/2 z-[60] max-h-[calc(100vh-48px)] w-[calc(100vw-48px)] max-w-[1080px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-feature bg-surface-muted shadow-drawer focus:outline-none", className)}
        >
          <Dialog.Title className="sr-only-v">{title}</Dialog.Title>
          <Dialog.Description className="sr-only-v">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const DialogClose = Dialog.Close;

export function Toast({ message, onDone, ms = 2600 }: { message: string | null; onDone: () => void; ms?: number }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, onDone, ms]);
  if (!message) return null;
  return (
    <div role="status" className="fixed top-[100px] left-1/2 z-[70] -translate-x-1/2 rounded-pill bg-ink px-[22px] py-3.5 text-sm text-white shadow-toast">
      {message}
    </div>
  );
}
