import { redirect } from "next/navigation";
import { SparqBadge } from "@/design-system/primitives";
import { LoginForm } from "@/features/auth/LoginForm";
import { safeNextPath } from "@/features/auth/redirect";
import { isSupabaseMode } from "@/lib/data-source";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/** Sign-in for the demonstration (Supabase Auth, controlled accounts). In memory mode there is nothing to sign in to. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (!isSupabaseMode()) redirect("/");
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw) ?? undefined;
  return (
    <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center gap-8 bg-canvas px-5 py-16">
      <div className="flex items-center gap-2.5"><SparqBadge size={34} glyph={16} /><span className="text-[17px] font-semibold tracking-[-0.02em]">Sparq</span></div>
      <section className="flex flex-col gap-6 rounded-surface bg-surface p-8 shadow-card">
        <div className="flex flex-col gap-2">
          <h1 className="text-[36px] leading-[1.05] font-light tracking-[-0.03em]">Welcome <span className="font-medium">back.</span></h1>
          <p className="text-sm text-mute">Sign in with the account you were given for this demonstration.</p>
        </div>
        <LoginForm next={next} />
        <p className="text-[13px] leading-[1.45] text-mute">This is a demonstration with fictional people and data. Accounts are created for the demo; there is no public registration.</p>
      </section>
    </main>
  );
}
