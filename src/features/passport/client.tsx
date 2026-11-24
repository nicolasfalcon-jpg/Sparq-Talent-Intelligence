"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import type { EvidenceLevel, ProjectExperience, SkillEvidence } from "@/domain/schemas";
import { SparkGlyph } from "@/design-system/icons";
import { Portrait } from "@/design-system/Portrait";
import { EvidenceDot, pillClass, SkillChip } from "@/design-system/primitives";
import { Drawer, Modal, Toast } from "@/design-system/overlays";
import { ProvenanceTag } from "@/features/ask-sparq/client";
import { useUi } from "@/lib/ui-store";
import { addExperience, addSkill, removeSkill, toggleInterest, updateSummary } from "./actions";
import type { NeedSummary, PassportView } from "./queries";

/* ---------------- Ask Sparq "summarize for a need" ---------------- */

export function PassportSummaryCard({ heading, needs, staff, personId, first }: { heading: string; needs: NeedSummary[]; staff: boolean; personId: string; first: string }) {
  const [key, setKey] = useState<string | null>(null);
  const cur = needs.find((n) => n.key === key);
  return (
    <section aria-label="Ask Sparq summary" className="flex flex-col gap-3.5 rounded-surface px-[26px] py-[22px]" style={{ background: "var(--gradient-ai-soft)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-coral"><SparkGlyph size={14} /></span>
        <span className="min-w-[220px] flex-1 font-medium">{heading}</span>
        {needs.map((n) => (
          <button key={n.key} type="button" aria-pressed={key === n.key} onClick={() => setKey(n.key)} className={pillClass(key === n.key ? "ink" : "default", "sm")}>{n.label}</button>
        ))}
      </div>
      {cur && (
        <>
          <p className="text-lg leading-[1.45] font-light tracking-[-0.01em]">{cur.answer}</p>
          <div className="grid grid-cols-3 gap-2.5 max-lg:grid-cols-1">
            {cur.items.map((it) => <div key={it.k} className="flex flex-col gap-1 rounded-lg bg-white/90 px-4 py-3.5"><span className="text-sm font-medium">{it.k}</span><span className="text-[13px] text-mute">{it.v}</span></div>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {staff && <Link href={`/opportunities/new/team?with=${personId}`} className={pillClass("ink", "sm")}>Add {first} to a team</Link>}
            <button type="button" className={pillClass("default", "sm")} onClick={() => setKey(null)}>Close</button>
            <ProvenanceTag provenance="computed" />
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------- Selected work ---------------- */

export function WorkList({ projects }: { projects: ProjectExperience[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ [projects[0]?.id ?? ""]: true });
  if (projects.length === 0) return <p className="text-mute">No projects documented yet.</p>;
  return (
    <>
      {projects.map((w) => {
        const isOpen = !!open[w.id];
        return (
          <article key={w.id} className="flex flex-col gap-[18px] rounded-surface bg-white p-8 shadow-card">
            <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-start gap-6 max-lg:grid-cols-1">
              <span className="pt-1.5 text-sm text-mute">{w.period}</span>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-mute">{w.client} · {w.role}</span>
                <h3 className="text-[26px] leading-[1.2] font-normal tracking-[-0.02em]">{w.title}</h3>
                <p className="max-w-[620px] text-base text-ink-2">{w.summary}</p>
                {w.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{w.tags.map((t) => <span key={t} className={pillClass("soft", "sm", "cursor-default")}>{t}</span>)}</div>}
              </div>
              <button type="button" className={pillClass("soft", "sm")} aria-expanded={isOpen} onClick={() => setOpen({ ...open, [w.id]: !isOpen })}>{isOpen ? "Hide evidence" : "Show evidence"}</button>
            </div>
            {isOpen && (
              <div className="ml-[164px] flex flex-col gap-2.5 rounded-lg bg-surface-muted px-6 py-[22px] max-lg:ml-0">
                {w.highlights.map((e) => <div key={e} className="flex gap-3 text-[15px]"><span className="text-ok" aria-hidden="true">✓</span><span>{e}</span></div>)}
                <span className="mt-1 text-[13px] text-mute">{w.source}</span>
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}

/* ---------------- Staff actions (hero) ---------------- */

export function StaffCompareLink({ personId }: { personId: string }) {
  const { compare, toggleCompare } = useUi();
  return (
    <Link href={`/compare?ids=${[personId, ...compare.filter((x) => x !== personId)].slice(0, 3).join(",")}`} onClick={() => { if (!compare.includes(personId)) toggleCompare(personId); }} className={pillClass("default", "lg")}>
      Compare
    </Link>
  );
}

/* ---------------- Preview & export ---------------- */

const FORMATS = [
  { v: "pdf", n: "PDF portfolio", d: "Designed for delivery leads", available: true },
  { v: "docx", n: "Word document", d: "Classic profile layout · planned", available: false },
  { v: "one", n: "One-page summary", d: "Skills, work and availability · planned", available: false },
] as const;

export function ExportButton({ view, label, size = "lg" }: { view: PassportView; label: string; size?: "lg" | "md" }) {
  const [open, setOpen] = useState(false);
  const [fmt, setFmt] = useState<(typeof FORMATS)[number]["v"]>("pdf");
  const [anon, setAnon] = useState(false);
  const [copied, setCopied] = useState(false);
  const cur = FORMATS.find((f) => f.v === fmt)!;
  const shown = (p: ProjectExperience) => (anon ? p.clientCategory ?? p.client : p.client);

  return (
    <>
      <button type="button" className={pillClass("default", size)} onClick={() => { setOpen(true); setCopied(false); }}>{label}</button>
      <Modal open={open} onOpenChange={setOpen} title="Preview and export passport" className="grid grid-cols-[330px_minmax(0,1fr)] max-lg:grid-cols-1">
        <div className="flex flex-col gap-[18px] bg-white p-[30px]">
          <div className="flex items-start justify-between">
            <h2 className="text-[26px] leading-[1.15] font-light tracking-[-0.02em]">Preview &amp; <span className="font-medium">export</span></h2>
            <button type="button" className={pillClass("soft", "sm", "w-[34px] px-0")} onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          <p className="text-sm text-mute">This is exactly what people inside Sparq will see.</p>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => (
              <button key={f.v} type="button" role="radio" aria-checked={fmt === f.v} onClick={() => setFmt(f.v)} className={clsx("flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-[18px] py-4 text-left", fmt === f.v ? "bg-ink text-white" : "bg-surface-muted text-ink")}>
                <span className="flex-1"><span className="block font-medium">{f.n}</span><span className="block text-[13px] opacity-70">{f.d}</span></span>
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" checked={anon} onChange={() => setAnon(!anon)} className="size-[18px] accent-ink" />Hide client names</label>
          <div className="flex-1" />
          <div className="flex flex-col gap-2">
            <button type="button" className={pillClass("coral", "lg", "h-12")} disabled={!cur.available} onClick={() => window.print()}>
              {cur.available ? `Export ${cur.n}` : `${cur.n} export is planned`}
            </button>
            <button type="button" className={pillClass("default", "lg")} onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/people/${view.person.id}`); setCopied(true); } catch { setCopied(false); } }}>
              {copied ? "✓ Internal link copied" : "Copy internal link"}
            </button>
            <span className="text-xs text-mute">PDF uses your browser’s print dialog (“Save as PDF”). Server-side PDF/Word generation and owner notifications are planned (see roadmap).</span>
          </div>
        </div>
        <div className="flex items-start justify-center p-9">
          <article data-print-root aria-label="Document preview" className="w-[600px] max-w-full overflow-hidden rounded-[8px] bg-white text-xs leading-[1.5] shadow-[0_24px_60px_rgba(0,0,0,.12)]">
            <div className="flex h-16 items-center justify-between bg-ink px-8">
              <span className="flex items-center gap-2.5 text-[15px] font-semibold text-white"><span className="inline-flex size-6 items-center justify-center rounded-full bg-coral"><SparkGlyph size={12} /></span>Sparq</span>
              <span className="text-[11px] tracking-[.08em] text-faint">TALENT PASSPORT</span>
            </div>
            <div className="flex flex-col gap-5 p-8">
              <div className="flex items-center gap-5">
                <Portrait who={view.person.id} size={84} decorative />
                <div><div className="text-[28px] leading-[1.1] font-normal tracking-[-0.02em]">{view.person.name}</div><div className="text-sm text-ink-2">{view.person.headline}</div><div className="text-mute">{view.person.location} · {view.person.yearsExperience} years · {view.availability.isNow ? "available now" : `available from ${view.availability.longDate}`}</div></div>
              </div>
              <p className="text-[13px] text-ink">{view.person.summary}</p>
              <div className="h-px bg-line" />
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2.5"><span className="text-[10px] font-semibold tracking-[.08em] text-coral-strong">EXPERTISE</span>
                  {view.groups.map((g) => <div key={g.title}><div className="font-semibold">{g.title}</div><div className="text-ink-2">{g.skills.map((k) => k.label).join(" · ")}</div></div>)}
                </div>
                <div className="flex flex-col gap-2.5"><span className="text-[10px] font-semibold tracking-[.08em] text-coral-strong">SELECTED WORK</span>
                  {view.projects.map((w) => <div key={w.id}><div className="font-semibold">{w.title}</div><div className="text-ink-2">{shown(w)} · {w.role} · {w.period}</div></div>)}
                </div>
              </div>
              {view.person.certifications.length > 0 && (
                <div className="flex flex-col gap-1.5"><span className="text-[10px] font-semibold tracking-[.08em] text-coral-strong">CERTIFICATIONS</span><span className="text-ink-2">{view.person.certifications.map((c) => `${c.name} (${c.date})`).join(" · ")}</span></div>
              )}
              <div className="h-px bg-line" />
              <div className="flex justify-between text-[10px] text-mute-2"><span>Internal use only · fictional demo data</span><span>Generated {view.generatedOn} · page 1 of 1</span></div>
            </div>
          </article>
        </div>
      </Modal>
    </>
  );
}

/* ---------------- Personal: edit drawer ---------------- */

const LEVELS: { v: EvidenceLevel; label: string }[] = [
  { v: "professional", label: "Professional" }, { v: "independent", label: "Independent" }, { v: "training", label: "Training" }, { v: "emerging", label: "Emerging" },
];
type Tab = "about" | "skills" | "exp" | "int";

export function OwnerActions({ view }: { view: PassportView }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("about");
  const [draft, setDraft] = useState(view.person.summary);
  const [skill, setSkill] = useState({ label: "", level: "professional" as EvidenceLevel });
  const [xp, setXp] = useState({ title: "", role: "", what: "" });
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void, msg?: string) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Something went wrong");
    else { onOk?.(); if (msg) setToast(msg); }
  });
  const openAt = (t: Tab) => { setTab(t); setDraft(view.person.summary); setError(null); setOpen(true); };
  const tabBtn = (t: Tab, label: string) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={pillClass(tab === t ? "ink" : "default", "sm")}>{label}</button>;
  const input = "h-[46px] w-full rounded-pill border-0 bg-surface-muted px-[18px] text-[15px] text-ink outline-none";
  const area = "w-full resize-y rounded-lg border-0 bg-surface-muted px-[18px] py-4 text-base leading-[1.6] text-ink outline-none";

  return (
    <>
      <div className="flex gap-2">
        <button type="button" className={pillClass("ink", "lg", "flex-1")} onClick={() => openAt("about")}>Edit my passport</button>
        <ExportButton view={view} label="Preview & export" />
      </div>
      <button type="button" className={pillClass("default", "lg")} onClick={() => openAt("exp")}>+ Add experience</button>
      <Toast message={toast} onDone={() => setToast(null)} />

      <Drawer open={open} onOpenChange={setOpen} title="Edit profile" width={480}
        header={
          <>
            <div className="flex items-start justify-between px-[26px] pt-[26px] pb-2.5">
              <div><h2 className="text-[26px] font-normal tracking-[-0.02em]">Edit profile</h2><p className="text-[13px] text-mute">Editing as {view.person.name} · changes are visible to staffing leads</p></div>
              <button type="button" className={pillClass("default", "sm", "w-9 px-0")} onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <div role="tablist" className="flex gap-1.5 px-[26px] py-2.5">{[tabBtn("about", "About"), tabBtn("skills", "Skills"), tabBtn("exp", "Experience"), tabBtn("int", "Interests")]}</div>
          </>
        }
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            {tab !== "about" && <span className="mr-auto text-xs text-mute">Saved as you add them.</span>}
            <button type="button" className={pillClass("default", "lg")} onClick={() => setOpen(false)}>{tab === "about" ? "Cancel" : "Done"}</button>
            {tab === "about" && <button type="button" className={pillClass("coral", "lg")} disabled={pending} onClick={() => run(() => updateSummary({ summary: draft }), () => setOpen(false), "✓ Passport updated")}>Save changes</button>}
          </div>
        }>
        {error && <p role="alert" className="rounded-md bg-coral-tint px-4 py-3 text-sm text-ink">{error}</p>}
        {tab === "about" && (
          <div className="flex flex-col gap-2"><label htmlFor="sum" className="text-[13px] text-mute">How you describe your work</label><textarea id="sum" rows={6} className={area} value={draft} onChange={(e) => setDraft(e.target.value)} /></div>
        )}
        {tab === "skills" && (
          <>
            <div className="flex flex-wrap gap-2">
              {view.evidence.map((k: SkillEvidence) => (
                <SkillChip key={k.id} label={k.label} level={k.level} isNew={k.selfReported}>
                  <button type="button" aria-label={`Remove ${k.label}`} disabled={pending} onClick={() => run(() => removeSkill({ evidenceId: k.id }))} className="-mr-2.5 size-6 cursor-pointer rounded-full border-0 bg-surface-muted text-[11px]">✕</button>
                </SkillChip>
              ))}
            </div>
            <form className="flex flex-col gap-2.5 rounded-card bg-white p-[18px] shadow-[inset_0_0_0_1px_var(--color-line)]" onSubmit={(e) => { e.preventDefault(); run(() => addSkill(skill), () => setSkill({ ...skill, label: "" }), "✓ Skill added · now searchable"); }}>
              <label htmlFor="ns" className="font-medium">Add a skill</label>
              <input id="ns" className={input} value={skill.label} onChange={(e) => setSkill({ ...skill, label: e.target.value })} placeholder="e.g. Core ML" />
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How it is documented">
                {LEVELS.map((l) => <button key={l.v} type="button" role="radio" aria-checked={skill.level === l.v} onClick={() => setSkill({ ...skill, level: l.v })} className={pillClass(skill.level === l.v ? "ink" : "soft", "sm")}><EvidenceDot level={l.v} size={8} />{l.label}</button>)}
              </div>
              <button type="submit" disabled={pending} className={pillClass("ink", "sm", "self-start")}>Add</button>
            </form>
          </>
        )}
        {tab === "exp" && (
          <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); run(() => addExperience(xp), () => { setXp({ title: "", role: "", what: "" }); setOpen(false); }, "✓ Experience added · awaiting confirmation"); }}>
            <p className="text-sm text-mute">Document a project in a few words. Your delivery lead can confirm it later.</p>
            <label htmlFor="xpn" className="text-[13px] font-medium">Project</label><input id="xpn" className={input} value={xp.title} onChange={(e) => setXp({ ...xp, title: e.target.value })} placeholder="Kestrel Travel discovery sprint" />
            <label htmlFor="xpr" className="text-[13px] font-medium">Your role</label><input id="xpr" className={input} value={xp.role} onChange={(e) => setXp({ ...xp, role: e.target.value })} placeholder="Mobile advisor" />
            <label htmlFor="xpw" className="text-[13px] font-medium">What you did</label><textarea id="xpw" rows={3} className={area} value={xp.what} onChange={(e) => setXp({ ...xp, what: e.target.value })} />
            <button type="submit" disabled={pending} className={pillClass("ink", "sm", "self-start")}>Add to my passport</button>
          </form>
        )}
        {tab === "int" && (
          <>
            <p className="text-sm text-mute">Used only to surface opportunities for you.</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(view.interestsAll).map(([n, on]) => <button key={n} type="button" aria-pressed={on} disabled={pending} onClick={() => run(() => toggleInterest({ interest: n }))} className={pillClass(on ? "ink" : "default", "sm")}>{n}</button>)}
              {Object.keys(view.interestsAll).length === 0 && <span className="text-sm text-mute">No interests yet.</span>}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
