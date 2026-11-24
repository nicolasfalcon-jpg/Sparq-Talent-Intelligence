/**
 * Sparq primitives. Visual specs come from V4.2 (`.pill`, `.tag`, `.sk`, `.d-*`, `.wh`, `.sf`, `.card`, `.oc`).
 * These are presentation-only: no data fetching, no business rules.
 */
import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { EvidenceLevel, Verification } from "@/domain/schemas";

/* ---------------- Pill button ---------------- */

export type PillVariant = "default" | "ink" | "coral" | "soft" | "glass";
export type PillSize = "sm" | "md" | "lg" | "xl";

const pillBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill border-0 font-medium leading-none cursor-pointer transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";
const pillVariant: Record<PillVariant, string> = {
  default: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface-hover",
  ink: "bg-ink text-white hover:bg-ink-hover",
  coral: "bg-coral-strong text-white hover:bg-coral-hover",
  soft: "bg-surface-muted text-ink hover:bg-surface-hover",
  glass: "bg-white/70 text-ink backdrop-blur-[8px] hover:bg-white",
};
const pillSize: Record<PillSize, string> = {
  sm: "h-[34px] px-[14px] text-[13px]",
  md: "h-10 px-[18px] text-sm",
  lg: "h-11 px-5 text-sm",
  xl: "h-[46px] px-5 text-sm",
};

export function pillClass(variant: PillVariant = "default", size: PillSize = "md", extra?: string) {
  return clsx(pillBase, pillVariant[variant], pillSize[size], extra);
}

type PillOwn = { variant?: PillVariant; size?: PillSize; pressed?: boolean };

export function Pill({ variant = "default", size = "md", pressed, className, ...rest }: PillOwn & ComponentPropsWithoutRef<"button">) {
  const v = pressed ? "ink" : variant;
  return <button type="button" aria-pressed={pressed} className={pillClass(v, size, className)} {...rest} />;
}

export function PillLink({ variant = "default", size = "md", className, href, ...rest }: PillOwn & ComponentPropsWithoutRef<typeof Link>) {
  return <Link href={href} className={pillClass(variant, size, className)} {...rest} />;
}

/** Circular icon button (close ✕ etc.). */
export function IconButton({ label, className, children, ...rest }: { label: string } & ComponentPropsWithoutRef<"button">) {
  return (
    <button type="button" aria-label={label} className={clsx(pillClass("default", "sm"), "w-9 px-0", className)} {...rest}>
      {children ?? "✕"}
    </button>
  );
}

/* ---------------- Tags & chips ---------------- */

export function Tag({ children, size = "md" }: { children: ReactNode; size?: "md" | "lg" }) {
  return (
    <span className={clsx("inline-flex items-center whitespace-nowrap rounded-pill bg-surface-muted text-[13px] text-ink-2", size === "md" ? "h-7 px-3" : "h-[30px] px-[13px]")}>
      {children}
    </span>
  );
}

/** Neutral info chip — used for "Fictional demo data" and snapshot disclosures. */
export function InfoChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-pill bg-surface-muted px-[11px] text-xs font-medium text-mute">
      <span className="size-1.5 rounded-full bg-faint" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ---------------- Evidence ---------------- */

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  professional: "Professional",
  independent: "Independent",
  training: "Training",
  emerging: "Emerging",
};

/** 9px evidence dot. Professional = filled ink, Independent = ink ring, Training = dashed grey ring, Emerging = coral. */
export function EvidenceDot({ level, size = 9 }: { level: EvidenceLevel | null; size?: number }) {
  const cls =
    level === "professional" ? "bg-ink"
    : level === "independent" ? "border-[1.5px] border-ink"
    : level === "training" ? "border-[1.5px] border-dashed border-mute"
    : level === "emerging" ? "bg-coral"
    : "border-[1.5px] border-line-strong bg-white";
  return <span aria-hidden="true" className={clsx("inline-block flex-none rounded-full", cls)} style={{ width: size, height: size }} />;
}

export function EvidenceLegend() {
  return (
    <div className="flex flex-wrap gap-[18px] text-[13px] text-mute">
      {(Object.keys(EVIDENCE_LABEL) as EvidenceLevel[]).map((l) => (
        <span key={l} className="inline-flex items-center gap-[7px]"><EvidenceDot level={l} />{EVIDENCE_LABEL[l]}</span>
      ))}
      {/* The dot is the SOURCE of the evidence. Verification is shown separately, as text, on anything not yet confirmed. */}
      <span className="inline-flex items-center gap-[7px] text-warn-text">Self-reported or pending: needs confirmation</span>
    </div>
  );
}

/** Verification as text, only when it needs attention. Verified evidence carries no badge. */
export function VerificationBadge({ verification, className }: { verification: Verification; className?: string }) {
  if (verification === "verified") return null;
  return <span className={clsx("text-[11px] font-semibold text-warn-text", className)}>{verification === "pending" ? "pending" : "self-reported"}</span>;
}

/** White skill chip with evidence dot (`.sk`). */
export function SkillChip({ label, level, title, isNew, verification, children }: { label: string; level: EvidenceLevel | null; title?: string; isNew?: boolean; verification?: Verification; children?: ReactNode }) {
  const needsConfirmation = verification !== undefined && verification !== "verified";
  return (
    <span title={title} className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-pill bg-surface pl-3 pr-4 text-sm text-ink">
      <EvidenceDot level={level} />
      {label}
      {verification && <VerificationBadge verification={verification} />}
      {isNew && !needsConfirmation && <span className="text-[11px] font-semibold text-coral-strong">new</span>}
      {children}
    </span>
  );
}

/* ---------------- Availability ---------------- */

export function AvailabilityDot({ confirmed, size = 8 }: { confirmed: boolean; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={clsx("inline-block flex-none rounded-full border-[1.5px]", confirmed ? "border-ok bg-ok" : "border-warn bg-white")}
      style={{ width: size, height: size }}
    />
  );
}

/* ---------------- Surfaces ---------------- */

export function Surface({ className, as: As = "div", ...rest }: { as?: "div" | "section" | "article" | "aside" } & ComponentPropsWithoutRef<"div">) {
  return <As className={clsx("rounded-surface bg-surface shadow-card", className)} {...rest} />;
}

export const liftCard = "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-[3px] hover:shadow-card-hover";

/** Gradient AI surface used for every Ask Sparq touchpoint. */
export function AiSurface({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className={clsx("rounded-surface", className)} style={{ background: "var(--gradient-ai-soft)" }}>
      {children}
    </section>
  );
}

export function SparqBadge({ size = 30, glyph = 14, shadow = false }: { size?: number; glyph?: number; shadow?: boolean }) {
  return (
    <span className={clsx("inline-flex flex-none items-center justify-center rounded-full bg-coral", shadow && "shadow-coral")} style={{ width: size, height: size }}>
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2.5l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></svg>
    </span>
  );
}

/** Light + medium display heading pattern: "Find the right <b>expertise.</b>" */
export function DisplayTitle({ light, strong, size = 52, as: As = "h1" }: { light: string; strong: string; size?: 36 | 52 | 56 | 64; as?: "h1" | "h2" }) {
  const cls = { 36: "text-[36px] tracking-[-0.03em]", 52: "text-[52px] leading-[1.05] tracking-[-0.035em] max-lg:text-[40px]", 56: "text-[56px] leading-[1.02] tracking-[-0.04em] max-lg:text-[44px]", 64: "text-[64px] leading-none tracking-[-0.045em] max-lg:text-[48px]" }[size];
  return (
    <As className={clsx("font-light", cls)}>
      {light} <span className="font-medium">{strong}</span>
    </As>
  );
}

export function Skeleton({ width }: { width: string }) {
  return <span className="block h-3 rounded-md" style={{ width, background: "var(--gradient-skeleton)" }} />;
}
