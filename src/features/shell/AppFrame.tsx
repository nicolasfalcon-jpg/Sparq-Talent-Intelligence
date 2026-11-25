import "server-only";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRepositories } from "@/data/repositories";
import { demoPersonaEnabled } from "@/lib/data-source";
import { homeFor } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { AskSparqPanel } from "@/features/ask-sparq/AskSparqPanel";
import { AppHeader } from "./AppHeader";

export type FrameMode = "staff" | "personal" | "admin";

/**
 * Workspace frame shared by the route groups. Enforces the workspace ↔ role rule server-side (a layout redirect is UX, not
 * protection: data is protected by the policy and, in Supabase mode, by row-level security).
 *  - staff: staffing leads (full workspace) and delivery leads (their opportunities and proposals to review)
 *  - personal: engineers (My space)
 *  - admin: administrators (a landing page)
 */
export async function AppFrame({ mode, children }: { mode: FrameMode; children: ReactNode }) {
  const user = await getSessionUser();
  const allowed = mode === "staff" ? user.role === "staffing_lead" || user.role === "delivery_lead" : mode === "personal" ? user.role === "engineer" : user.role === "admin";
  if (!allowed) redirect(homeFor(user));
  const notifications = await getRepositories().directory.listNotifications(user.role);
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader role={user.role} demo={demoPersonaEnabled()} user={{ name: user.name, title: user.title, portraitId: user.portraitId }} notifications={notifications} />
      {children}
      {user.role !== "admin" && <AskSparqPanel greetingName={user.name.split(" ")[0] ?? user.name} ownPersonId={user.personId} />}
    </div>
  );
}

export function PageContainer({ children, width = "page", className = "" }: { children: ReactNode; width?: "page" | "passport"; className?: string }) {
  return <main className={`mx-auto ${width === "page" ? "max-w-page" : "max-w-passport"} px-10 pt-6 pb-[120px] max-xl:px-5 ${className}`}>{children}</main>;
}
