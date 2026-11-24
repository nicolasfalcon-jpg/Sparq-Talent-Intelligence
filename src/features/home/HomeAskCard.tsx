"use client";
/** Home "Ask Sparq" feature card — V4.2 `v4-home` left column. */
import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import { Icon, RoleGlyph, SparkGlyph, TeamGlyph } from "@/design-system/icons";
import { Portrait } from "@/design-system/Portrait";
import { pillClass } from "@/design-system/primitives";
import { ProvenanceTag, useAsk } from "@/features/ask-sparq/client";

const sug = "box-border flex w-full cursor-pointer items-center gap-3 rounded-[18px] border-0 bg-white/65 px-3.5 py-3 text-left text-sm text-ink transition-colors hover:bg-white";

function Decoration() {
  return (
    <svg width="420" height="250" viewBox="0 0 420 250" aria-hidden="true" className="pointer-events-none absolute -top-2.5 -right-10">
      <defs>
        <radialGradient id="hs-a"><stop offset="0" stopColor="#FFB08C" stopOpacity=".95" /><stop offset="1" stopColor="#FFB08C" stopOpacity="0" /></radialGradient>
        <radialGradient id="hs-b"><stop offset="0" stopColor="#F15B40" stopOpacity=".55" /><stop offset="1" stopColor="#F15B40" stopOpacity="0" /></radialGradient>
        <linearGradient id="hs-c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE0D2" /><stop offset=".55" stopColor="#FF9B7C" /><stop offset="1" stopColor="#F15B40" /></linearGradient>
      </defs>
      <circle cx="270" cy="120" r="130" fill="url(#hs-a)" opacity=".55" />
      <circle cx="300" cy="96" r="80" fill="url(#hs-b)" />
      <g fill="none" stroke="#F15B40" transform="rotate(-18 260 120)"><ellipse cx="260" cy="120" rx="170" ry="62" strokeOpacity=".18" /><ellipse cx="260" cy="120" rx="122" ry="44" strokeOpacity=".24" /><ellipse cx="260" cy="120" rx="78" ry="28" strokeOpacity=".3" /></g>
      <circle cx="302" cy="98" r="36" fill="url(#hs-c)" />
      <circle cx="290" cy="86" r="10" fill="#fff" opacity=".45" />
      <circle cx="118" cy="160" r="6" fill="#F15B40" /><circle cx="392" cy="58" r="4" fill="#F15B40" opacity=".7" />
      <circle cx="208" cy="58" r="5" fill="#fff" stroke="#F15B40" strokeOpacity=".5" />
    </svg>
  );
}

export function HomeAskCard() {
  const ask = useAsk();
  const [q, setQ] = useState("");
  const send = () => { const t = q.trim(); if (!t) return; ask.mutate({ context: "home", question: t }); setQ(""); };
  const a = ask.data;

  return (
    <section aria-label="Ask Sparq" className="relative flex min-h-[640px] max-w-[440px] flex-[1_1_380px] flex-col gap-[18px] overflow-hidden rounded-feature p-7 shadow-ai-card max-lg:max-w-none" style={{ background: "var(--gradient-ai-card)" }}>
      <Decoration />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-coral shadow-coral"><SparkGlyph size={20} /></span>
          <span className="font-medium">Ask Sparq</span>
        </div>
        {!ask.isIdle && <button type="button" className={pillClass("glass", "sm")} onClick={() => ask.reset()}>New question</button>}
      </div>
      <div className="min-h-[110px] flex-1" />

      {ask.isIdle && (
        <>
          <h2 className="relative text-[34px] leading-[1.15] font-light tracking-[-0.03em]">What should we <span className="font-medium">build today?</span></h2>
          <div className="flex flex-col gap-2">
            <Link className={sug} href="/opportunities/new/role">
              <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-white"><RoleGlyph /></span>
              <span className="flex-1"><span className="block font-medium">Fill a role</span><span className="text-[13px] text-mute">Find documented expertise for one position</span></span>
              <span className="text-mute" aria-hidden="true">→</span>
            </Link>
            <Link className={sug} href="/opportunities/new/team">
              <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-ink text-white"><TeamGlyph /></span>
              <span className="flex-1"><span className="block font-medium">Build a team</span><span className="text-[13px] text-mute">Compose a whole project team</span></span>
              <span className="text-mute" aria-hidden="true">→</span>
            </Link>
            <button type="button" className={sug} onClick={() => ask.mutate({ context: "home", promptId: "home-mobile-january" })}>
              <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-white"><Icon name="target" size={15} strokeWidth={1.8} /></span>
              <span className="flex-1 font-medium">Who’s free for mobile work in January?</span>
            </button>
          </div>
        </>
      )}

      {ask.isPending && <p className="relative text-mute" aria-live="polite">Looking through documented profiles…</p>}
      {ask.isError && <p role="alert" className="relative">Ask Sparq is unavailable right now. <button type="button" className="underline" onClick={() => ask.variables && ask.mutate(ask.variables)}>Try again</button></p>}
      {a && (
        <div className="relative flex flex-col gap-3.5">
          <span className="text-[13px] text-mute">{a.question}</span>
          <p className="text-[22px] leading-[1.3] font-light tracking-[-0.02em]">{a.answer}</p>
          <div className="flex flex-col gap-2">
            {a.refs.map((r) => (
              <Link key={r.personId} href={r.href} className="flex items-center gap-3 rounded-lg bg-white/80 px-3 py-2.5">
                <Portrait who={r.personId} size={40} decorative />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{r.name}</span><span className="block text-[13px] text-mute">{r.evidence}</span></span>
                {r.when && <span className={clsx("text-xs", r.whenTone === "ok" ? "text-ok-text" : "text-mute")}>{r.when}</span>}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {a.actions.map((x, i) => <Link key={x.label} href={x.href} className={pillClass(i === 0 ? "ink" : "glass", "sm")}>{x.label}</Link>)}
          </div>
          <ProvenanceTag provenance={a.provenance} />
        </div>
      )}

      <form className="relative flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="ask" className="sr-only-v">Ask Sparq</label>
        <div className="flex h-[54px] flex-1 items-center rounded-pill bg-white px-[18px] shadow-[0_4px_16px_rgba(241,91,64,.08)]">
          <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything…" className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none" />
        </div>
        <button type="submit" aria-label="Ask" className="inline-flex size-[54px] flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-coral text-white shadow-coral"><Icon name="arrowUp" size={18} strokeWidth={2.2} /></button>
      </form>
    </section>
  );
}
