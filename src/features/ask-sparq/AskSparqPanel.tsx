"use client";
/**
 * Global Ask Sparq: floating action button → side drawer (440px, or 900px "wide") → minimized card.
 * Visual spec: V4.2 `v4-nav` (FAB 52px coral, bottom/right 20px; drawer inset 16px radius 32).
 */
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Icon, SparkGlyph } from "@/design-system/icons";
import { useUi } from "@/lib/ui-store";
import { AnswerCard, AnswerError, AnswerLoading, useAsk } from "./client";
import { ASSISTANT_CONTENT, contextForPath } from "./content";
import { OPPORTUNITY_CONTEXTS, SEAT_CONTEXTS } from "./context-rules";
import { useAssistantPageContext } from "./page-context";

function DrawerDecoration() {
  return (
    <svg width="300" height="200" viewBox="0 0 300 200" aria-hidden="true" className="pointer-events-none absolute -top-[30px] -right-[50px]">
      <g fill="none" stroke="#F15B40" transform="rotate(-18 170 100)"><ellipse cx="170" cy="100" rx="130" ry="46" strokeOpacity=".16" /><ellipse cx="170" cy="100" rx="86" ry="30" strokeOpacity=".24" /></g>
      <circle cx="200" cy="86" r="26" fill="#FF9B7C" opacity=".5" /><circle cx="96" cy="128" r="4" fill="#F15B40" />
    </svg>
  );
}

const roundBtn = "inline-flex size-9 items-center justify-center rounded-full border-0 bg-white/85 cursor-pointer";

export function AskSparqPanel({ greetingName, ownPersonId }: { greetingName: string; ownPersonId: string | null }) {
  const pathname = usePathname();
  const context = contextForPath(pathname);
  const content = ASSISTANT_CONTENT[context];
  const subjectPersonId = pathname.startsWith("/people/") ? pathname.split("/")[2] : pathname.startsWith("/me/passport") ? ownPersonId ?? undefined : undefined;
  const { assistant, wide, openAssistant, closeAssistant, minimizeAssistant, toggleWide } = useUi();
  const ask = useAsk();
  const pageCtx = useAssistantPageContext();
  const [draft, setDraft] = useState("");
  const hello = context === "home" ? `Good morning, ${greetingName}.` : content.hello;

  const send = (promptId?: string) => {
    const q = draft.trim();
    if (!promptId && !q) return;
    ask.mutate({
      context, promptId, question: promptId ? undefined : q, subjectPersonId,
      // Only what the server accepts for this context; it re-authorizes all of it anyway.
      opportunityId: OPPORTUNITY_CONTEXTS.includes(context) ? pageCtx.opportunityId : undefined,
      seats: SEAT_CONTEXTS.includes(context) ? pageCtx.seats : undefined,
    });
    setDraft("");
  };
  const reset = () => ask.reset();
  const close = () => { ask.reset(); closeAssistant(); };

  return (
    <>
      {assistant === "closed" && (
        <button type="button" onClick={openAssistant} aria-label={`Ask Sparq about ${content.short}`} title="Ask Sparq"
          className="fixed right-5 bottom-5 z-[45] inline-flex size-[52px] cursor-pointer items-center justify-center rounded-full border-[3px] border-white bg-coral p-0 shadow-fab">
          <SparkGlyph size={20} />
        </button>
      )}

      {assistant === "min" && (
        <div role="dialog" aria-label="Ask Sparq, minimized" className="fixed right-7 bottom-7 z-[45] flex w-[380px] items-start gap-3 rounded-[26px] py-4 pr-4 pl-[18px] shadow-[0_18px_50px_rgba(241,91,64,.18),0_2px_6px_rgba(0,0,0,.06)]" style={{ background: "var(--gradient-ai-min)" }}>
          <span className="inline-flex size-[34px] flex-none items-center justify-center rounded-full bg-coral"><SparkGlyph size={15} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-mute">Ask Sparq · {content.short}</div>
            <div className="line-clamp-2 text-sm leading-[1.4]">{ask.isPending ? "Working on it…" : ask.data?.answer ?? content.intro}</div>
          </div>
          <button type="button" onClick={openAssistant} aria-label="Expand Ask Sparq" className="size-8 flex-none cursor-pointer rounded-full border-0 bg-white"><Icon name="chevronUp" size={13} strokeWidth={2} className="mx-auto" /></button>
          <button type="button" onClick={close} aria-label="Close Ask Sparq" className="size-8 flex-none cursor-pointer rounded-full border-0 bg-white text-xs">✕</button>
        </div>
      )}

      <Dialog.Root open={assistant === "open"} onOpenChange={(o) => (o ? openAssistant() : minimizeAssistant())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[58] bg-black/15" />
          <Dialog.Content
            className={clsx("fixed top-4 right-4 bottom-4 z-[60] flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-panel shadow-[0_30px_80px_rgba(0,0,0,.2)] transition-[width] duration-[250ms] ease-out focus:outline-none", wide ? "w-[900px]" : "w-[440px]")}
            style={{ background: "var(--gradient-ai-drawer)" }}
          >
            <DrawerDecoration />
            <div className="relative flex items-center gap-2.5 px-5 pt-5 pb-2">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-coral"><SparkGlyph size={17} /></span>
              <div className="flex-1">
                <Dialog.Title className="font-medium">Ask Sparq</Dialog.Title>
                <Dialog.Description className="text-xs text-mute">Looking at {content.short}</Dialog.Description>
              </div>
              <button type="button" className={roundBtn} onClick={minimizeAssistant} aria-label="Minimize"><Icon name="minus" size={14} strokeWidth={2} /></button>
              <button type="button" className={roundBtn} onClick={toggleWide} aria-label={wide ? "Collapse" : "Expand"}><Icon name={wide ? "collapse" : "expand"} size={14} strokeWidth={1.8} /></button>
              <button type="button" className={clsx(roundBtn, "text-[13px]")} onClick={close} aria-label="Close">✕</button>
            </div>

            <div className="relative flex flex-1 flex-col gap-4 overflow-auto px-[22px] py-3.5">
              {ask.isIdle && (
                <>
                  <div className="min-h-10 flex-1" />
                  <h2 className="text-[28px] leading-[1.2] font-light tracking-[-0.025em]">{hello}</h2>
                  <p className="text-sm text-mute">{content.intro}</p>
                  <div className={clsx("grid gap-2", wide ? "grid-cols-2" : "grid-cols-1")}>
                    {content.prompts.map((p) => (
                      <button key={p.id} type="button" onClick={() => send(p.id)} className="flex cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-white/90 px-4 py-3.5 text-left text-sm font-medium text-ink">
                        <span className="text-coral" aria-hidden="true">✦</span>{p.q}
                      </button>
                    ))}
                    {content.prompts.length === 0 && <p className="text-sm text-mute">Suggestions for this page arrive with this module (see the roadmap). You can still ask about skills or availability.</p>}
                  </div>
                </>
              )}
              {!ask.isIdle && ask.variables && (
                <div className="max-w-[85%] self-end rounded-[22px_22px_6px_22px] bg-ink px-[18px] py-3 text-sm text-white">
                  {ask.variables.question ?? content.prompts.find((p) => p.id === ask.variables?.promptId)?.q}
                </div>
              )}
              {ask.isPending && <AnswerLoading />}
              {ask.isError && <AnswerError message={ask.error.message} onRetry={() => ask.variables && ask.mutate(ask.variables)} />}
              {ask.isSuccess && <AnswerCard a={ask.data} onReset={reset} />}
            </div>

            <form className="relative flex items-center gap-2 px-[18px] pt-3 pb-[18px]" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <label htmlFor="nav-ai-q" className="sr-only-v">Ask Sparq</label>
              <div className="focus-ring-within flex h-[52px] flex-1 items-center rounded-pill bg-white px-[18px]">
                <input id="nav-ai-q" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask anything…" className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none" />
              </div>
              <button type="submit" aria-label="Send" className="inline-flex size-[52px] cursor-pointer items-center justify-center rounded-full border-0 bg-coral text-white"><Icon name="arrowUp" size={18} strokeWidth={2.2} /></button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
