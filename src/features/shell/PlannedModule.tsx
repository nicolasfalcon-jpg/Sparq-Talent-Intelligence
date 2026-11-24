import Link from "next/link";
import { DisplayTitle, pillClass } from "@/design-system/primitives";
import { SparkGlyph } from "@/design-system/icons";

/**
 * Honest placeholder for modules scheduled after phase 1. Routes exist so navigation is real;
 * the page states plainly that the module is not built yet and where its spec lives.
 */
export function PlannedModule({ light, strong, phase, summary, specAnchor, designFile }: {
  light: string; strong: string; phase: string; summary: string; specAnchor: string; designFile: string;
}) {
  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-10 pt-6 pb-[120px] max-xl:px-5">
      <DisplayTitle light={light} strong={strong} />
      <section className="flex max-w-[760px] flex-col gap-4 rounded-surface p-8" style={{ background: "var(--gradient-ai-soft)" }}>
        <span className="inline-flex items-center gap-3"><span className="inline-flex size-[30px] items-center justify-center rounded-full bg-coral"><SparkGlyph size={14} /></span><span className="font-medium">Planned for {phase}</span></span>
        <p className="text-lg leading-[1.45] font-light">{summary}</p>
        <p className="text-sm text-mute">
          Functional spec: <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">docs/handoff/03-functional-spec.md · {specAnchor}</code> · Approved design: <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">design-reference/v4.2/screens/{designFile}</code>
        </p>
        <div className="flex gap-2"><Link href="/" className={pillClass("ink", "sm")}>Back to Home</Link><Link href="/people" className={pillClass("default", "sm")}>Browse people</Link></div>
      </section>
    </main>
  );
}
