"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { SparkGlyph } from "@/design-system/icons";
import { Portrait } from "@/design-system/Portrait";
import { pillClass } from "@/design-system/primitives";
import { COMPARE_LIMIT, useHydrated, useUi } from "@/lib/ui-store";

/** Natural-language search bar. Navigates to /people?q=… so results are shareable URLs. */
export function PeopleSearchBar({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [pending, start] = useTransition();

  const go = (text: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("caps"); next.delete("sel");
    if (text.trim()) next.set("q", text.trim()); else next.delete("q");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <>
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(q); }} className="focus-ring-within flex h-[68px] items-center gap-3 rounded-pill bg-white pr-2.5 pl-3 shadow-search">
        <span className="inline-flex size-[46px] flex-none items-center justify-center rounded-full bg-coral"><SparkGlyph size={18} /></span>
        <label htmlFor="nl" className="sr-only-v">Describe who you are looking for</label>
        <input id="nl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe who you’re looking for…" className="min-w-0 flex-1 border-0 bg-transparent text-[17px] text-ink outline-none" />
        {initialQ && <button type="button" className={pillClass("soft")} onClick={() => { setQ(""); go(""); }}>Clear</button>}
        <button type="submit" className={pillClass("ink", "md", "h-12 px-6")}>Search</button>
      </form>
      {pending && <p className="pl-6 text-mute" aria-live="polite">Reading documented skills and availability…</p>}
    </>
  );
}

export function AddToCompareButton({ personId }: { personId: string }) {
  const { compare, toggleCompare } = useUi();
  const hydrated = useHydrated();
  const on = compare.includes(personId);
  const full = !on && compare.length >= COMPARE_LIMIT;
  return (
    <button type="button" className={pillClass("default", "xl")} aria-pressed={on} disabled={!hydrated || full} onClick={() => toggleCompare(personId)} title={full ? `Compare up to ${COMPARE_LIMIT} people` : undefined}>
      {on ? "✓ Added to compare" : "Add to compare"}
    </button>
  );
}

/** Floating compare tray (bottom center) — appears once at least one person is selected. */
export function CompareTray() {
  const { compare, clearCompare } = useUi();
  if (compare.length === 0) return null;
  return (
    <div className="fixed bottom-7 left-1/2 z-[44] flex h-[60px] -translate-x-1/2 items-center gap-3.5 rounded-pill bg-ink pr-2 pl-3 text-white shadow-toast">
      <div className="flex">{compare.map((id) => <span key={id} className="-mr-2.5 inline-flex rounded-full border-2 border-ink"><Portrait who={id} size={36} decorative /></span>)}</div>
      <span className="ml-3 text-sm">{compare.length} selected</span>
      <button type="button" onClick={clearCompare} className="cursor-pointer border-0 bg-transparent text-[13px] font-medium text-faint">Clear</button>
      <Link href={`/compare?ids=${compare.join(",")}`} className={pillClass("coral", "lg")}>Compare</Link>
    </div>
  );
}

export function MoreExperience({ projects }: { projects: string[] }) {
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;
  return (
    <>
      {open && (
        <div className="flex flex-col gap-1.5 pt-1.5">
          <span className="text-[13px] text-mute">Recent projects</span>
          {projects.map((p) => <span key={p} className="text-sm">{p}</span>)}
        </div>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="cursor-pointer self-start border-0 bg-transparent p-0 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4">
        {open ? "Show less" : "Show more experience"}
      </button>
    </>
  );
}
