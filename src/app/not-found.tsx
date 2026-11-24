import Link from "next/link";
import { pillClass } from "@/design-system/primitives";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-page flex-col items-start gap-4 px-10 pt-16">
      <h1 className="text-[36px] font-light tracking-[-0.03em]">Page <span className="font-medium">not found.</span></h1>
      <Link href="/" className={pillClass("ink")}>Back to Home</Link>
    </main>
  );
}
