"use client";
import { useActionState } from "react";
import { pillClass } from "@/design-system/primitives";
import { signIn } from "./actions";
import type { SignInState } from "./schema";

const field = "h-11 w-full rounded-md border-0 bg-surface-muted px-3.5 text-sm text-ink shadow-[inset_0_0_0_1px_var(--color-line)] placeholder:text-mute-2";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
        Email
        <input name="email" type="email" autoComplete="username" required className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      <p role="alert" aria-live="polite" className="min-h-5 text-[13px] text-warn-text">{state.error}</p>
      <button type="submit" disabled={pending} className={pillClass("coral", "xl", "w-full")}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
