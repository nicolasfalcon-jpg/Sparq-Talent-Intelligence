import Link from "next/link";
import { pillClass } from "@/design-system/primitives";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-passport flex-col items-start gap-4 px-10 pt-10 pb-24">
      <h1 className="text-[36px] font-light tracking-[-0.03em]">This passport <span className="font-medium">doesn’t exist.</span></h1>
      <p className="text-mute">The profile may have been removed or the link is incomplete.</p>
      <Link href="/people" className={pillClass("ink")}>Back to People</Link>
    </main>
  );
}
