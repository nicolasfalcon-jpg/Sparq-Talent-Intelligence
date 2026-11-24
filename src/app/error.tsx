"use client";
import { pillClass } from "@/design-system/primitives";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-page flex-col items-start gap-4 px-10 pt-16">
      <h1 className="text-[36px] font-light tracking-[-0.03em]">Something <span className="font-medium">went wrong.</span></h1>
      <p className="text-mute">The page couldn’t load. Your data is unchanged.</p>
      <button type="button" className={pillClass("ink")} onClick={reset}>Try again</button>
    </main>
  );
}
