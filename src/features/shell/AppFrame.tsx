import "server-only";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRepositories } from "@/data/repositories";
import { getSessionUser } from "@/lib/session";
import { AskSparqPanel } from "@/features/ask-sparq/AskSparqPanel";
import { AppHeader } from "./AppHeader";

/**
 * Workspace frame shared by the staff and personal route groups.
 * Enforces the workspace ↔ role rule server-side (staffing leads use the staff workspace,
 * engineers use their personal space). Demo persona today, Supabase Auth in phase 2.
 */
export async function AppFrame({ mode, children }: { mode: "staff" | "personal"; children: ReactNode }) {
  const user = await getSessionUser();
  if (mode === "staff" && user.role !== "staffing_lead") redirect("/me");
  if (mode === "personal" && user.role !== "engineer") redirect("/");
  const notifications = await getRepositories().directory.listNotifications(user.role);
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader mode={mode} user={{ name: user.name, title: user.title, portraitId: user.portraitId }} notifications={notifications} />
      {children}
      <AskSparqPanel greetingName={user.name.split(" ")[0] ?? user.name} ownPersonId={user.personId} />
    </div>
  );
}

export function PageContainer({ children, width = "page", className = "" }: { children: ReactNode; width?: "page" | "passport"; className?: string }) {
  return <main className={`mx-auto ${width === "page" ? "max-w-page" : "max-w-passport"} px-10 pt-6 pb-[120px] max-xl:px-5 ${className}`}>{children}</main>;
}
