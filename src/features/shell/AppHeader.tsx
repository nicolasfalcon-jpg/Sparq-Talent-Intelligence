"use client";
/**
 * App header — V4.2 `v4-nav` header. 84px tall, max 1360, three zones:
 * brand (left) · pill navigation (center) · actions (right).
 * Below 1180px (`max-xl`, strict): nav and "New opportunity" collapse to icons (labels hidden, kept for screen readers via aria-label).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { clsx } from "clsx";
import type { Notification, UserRole } from "@/domain/schemas";
import { Icon, RoleGlyph, SparkGlyph, TeamGlyph, type IconName } from "@/design-system/icons";
import { Portrait } from "@/design-system/Portrait";

type NavItem = { id: string; label: string; href: string; icon: IconName; match: (p: string) => boolean };

const STAFF_NAV: NavItem[] = [
  { id: "home", label: "Home", href: "/", icon: "home", match: (p) => p === "/" },
  { id: "people", label: "People", href: "/people", icon: "people", match: (p) => p.startsWith("/people") || p.startsWith("/compare") },
  { id: "opps", label: "Opportunities", href: "/opportunities", icon: "opportunities", match: (p) => p.startsWith("/opportunities") },
  { id: "planning", label: "Planning", href: "/planning", icon: "planning", match: (p) => p.startsWith("/planning") },
  { id: "insights", label: "Insights", href: "/insights", icon: "insights", match: (p) => p.startsWith("/insights") },
];
const DELIVERY_NAV: NavItem[] = [
  { id: "opps", label: "Opportunities", href: "/opportunities", icon: "opportunities", match: (p) => p.startsWith("/opportunities") },
];
const ADMIN_NAV: NavItem[] = [
  { id: "admin", label: "Administration", href: "/admin", icon: "home", match: (p) => p.startsWith("/admin") },
];
const PERSONAL_NAV: NavItem[] = [
  { id: "me", label: "My space", href: "/me", icon: "me", match: (p) => p === "/me" },
  { id: "passport", label: "My passport", href: "/me/passport", icon: "passport", match: (p) => p.startsWith("/me/passport") },
];

const floatBtn = "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white shadow-nav";
const panel = "z-50 rounded-card bg-white p-2.5 shadow-popover focus:outline-none";

const HOME_FOR: Record<UserRole, string> = { staffing_lead: "/", engineer: "/me", delivery_lead: "/opportunities", admin: "/admin" };
const DEMO_SWITCH: { as: UserRole; label: string }[] = [
  { as: "staffing_lead", label: "Staffing" }, { as: "delivery_lead", label: "Delivery" }, { as: "engineer", label: "My space" }, { as: "admin", label: "Admin" },
];

export function AppHeader({ role, demo, user, notifications }: {
  /** The signed-in user's role: decides the navigation. */
  role: UserRole;
  /** Memory mode only: show the demo persona switch. Otherwise the menu offers "Sign out". */
  demo: boolean;
  user: { name: string; title: string; portraitId: string };
  notifications: Notification[];
}) {
  const pathname = usePathname();
  const items = role === "staffing_lead" ? STAFF_NAV : role === "delivery_lead" ? DELIVERY_NAV : role === "admin" ? ADMIN_NAV : PERSONAL_NAV;
  const [read, setRead] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <header className="relative z-40 mx-auto flex h-header max-w-page items-center gap-5 px-10 max-xl:gap-3 max-xl:px-5">
      <Link href={HOME_FOR[role]} className="flex min-w-max flex-1 basis-0 items-center gap-2.5 text-ink">
        <span className="inline-flex size-[34px] items-center justify-center rounded-full bg-coral"><SparkGlyph size={16} /></span>
        <span className="text-[17px] font-semibold tracking-[-0.02em]">Sparq</span>
      </Link>

      <nav aria-label="Primary" className="flex gap-0.5 rounded-pill bg-white p-[5px] shadow-nav">
        {items.map((it) => {
          const on = it.match(pathname);
          return (
            <Link key={it.id} href={it.href} aria-current={on ? "page" : undefined} aria-label={it.label} title={it.label}
              className={clsx("inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-medium transition-colors duration-[180ms]", on ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-muted")}>
              <Icon name={it.icon} size={17} />
              <span className="max-xl:hidden">{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex min-w-max flex-1 basis-0 items-center justify-end gap-2.5">
        {role === "staffing_lead" && (
          <Popover.Root open={newOpen} onOpenChange={setNewOpen}>
            <Popover.Trigger aria-label="New opportunity" title="New opportunity" className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-pill border-0 bg-ink px-[18px] text-sm font-medium text-white">
              <span className="text-lg leading-none text-coral-soft" aria-hidden="true">+</span><span className="max-xl:hidden">New opportunity</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={10} className={clsx(panel, "flex w-[360px] flex-col gap-1.5 rounded-[26px]")}>
                <Link href="/opportunities/new/role" onClick={() => setNewOpen(false)} className="flex items-center gap-3.5 rounded-lg bg-surface-muted p-4 text-ink">
                  <span className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-white"><RoleGlyph size={18} /></span>
                  <span><span className="block font-medium">Fill a role</span><span className="block text-[13px] text-mute">Find documented expertise for one position</span></span>
                </Link>
                <Link href="/opportunities/new/team" onClick={() => setNewOpen(false)} className="flex items-center gap-3.5 rounded-lg p-4 text-ink" style={{ background: "radial-gradient(100% 140% at 100% 0%, #FFE2D4 0%, rgba(255,226,212,0) 60%), #FFF8F5" }}>
                  <span className="inline-flex size-11 flex-none items-center justify-center rounded-full bg-coral"><TeamGlyph size={18} color="#fff" /></span>
                  <span><span className="block font-medium">Build a team</span><span className="block text-[13px] text-mute">Compose a multidisciplinary project team</span></span>
                </Link>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}

        <Popover.Root>
          <Popover.Trigger aria-label="Notifications" className={clsx(floatBtn, "relative")}>
            <Icon name="bell" size={18} strokeWidth={1.6} />
            {!read && notifications.length > 0 && <span className="absolute top-[11px] right-3 size-[7px] rounded-full bg-coral" aria-hidden="true" />}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={10} className={clsx(panel, "w-[350px]")}>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="font-medium">Recent activity</span>
                <button type="button" onClick={() => setRead(true)} className="cursor-pointer border-0 bg-transparent text-xs font-medium text-mute">Mark read</button>
              </div>
              {notifications.length === 0 && <p className="px-3 pb-3 text-sm text-mute">Nothing new.</p>}
              {notifications.map((n) => (
                <Link key={n.id} href={n.href} className="flex gap-3 rounded-md p-3 text-ink hover:bg-surface-muted">
                  <Portrait who={n.actorPersonId} size={36} decorative />
                  <span className="text-sm leading-[1.4]"><strong className="font-medium">{n.actorName}</strong> <span className="text-ink-2">{n.text}</span><span className="mt-0.5 block text-xs text-mute">{n.when}</span></span>
                </Link>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Popover.Root>
          <Popover.Trigger aria-label="Account and workspace" className="size-11 cursor-pointer rounded-full border-0 bg-transparent p-0 shadow-[0_0_0_2px_#fff,0_1px_6px_rgba(0,0,0,.12)]">
            <Portrait who={user.portraitId} size={44} decorative />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={10} className={clsx(panel, "w-[280px]")}>
              <div className="p-3"><div className="font-medium">{user.name}</div><div className="text-[13px] text-mute">{user.title}</div></div>
              {demo ? (
                <div className="mx-1 mt-1 mb-2 grid grid-cols-2 gap-1 rounded-card bg-surface-muted p-1" role="group" aria-label="Workspace">
                  {/* Persona switch: DEMO ONLY (memory mode). It does not exist when the app runs on Supabase. */}
                  {DEMO_SWITCH.map((d) => (
                    <a key={d.as} href={`/persona?as=${d.as}`} aria-current={d.as === role ? "true" : undefined} className={clsx("flex h-9 items-center justify-center rounded-pill text-[13px] font-medium", d.as === role && "bg-white shadow-[0_1px_3px_rgba(0,0,0,.1)]")}>{d.label}</a>
                  ))}
                </div>
              ) : null}
              {role === "engineer" && (
                <Link href="/me/passport" className="block rounded-sm px-3 py-2.5 text-sm text-ink hover:bg-surface-muted">My Talent Passport</Link>
              )}
              {demo && role === "staffing_lead" && (
                <Link href="/people/ana" className="block rounded-sm px-3 py-2.5 text-sm text-ink hover:bg-surface-muted">Sample passport: Ana Ruiz</Link>
              )}
              {!demo && (
                <form action="/logout" method="post">
                  <button type="submit" className="block w-full cursor-pointer rounded-sm border-0 bg-transparent px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-muted">Sign out</button>
                </form>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </header>
  );
}
