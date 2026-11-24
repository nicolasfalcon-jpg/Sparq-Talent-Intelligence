/**
 * Icon set used by the approved design. 24×24 viewBox, 1.6–1.8 stroke, round caps.
 * Paths are copied verbatim from V4.2 so icons render identically.
 */
import type { SVGProps } from "react";

export const ICON_PATHS = {
  home: "M4 11l8-6.5 8 6.5V20h-5v-5H9v5H4z",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6 6 0 0 1 3 5.5",
  opportunities: "M4 8h16v11H4zM9 8V5.5h6V8",
  planning: "M5 7h8M8 12h11M5 17h7",
  insights: "M12 3a9 9 0 1 0 9 9h-9z",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  passport: "M5 4h14v16H5zM12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 16a3.5 3.5 0 0 1 7 0",
  bell: "M6.5 16v-5a5.5 5.5 0 1 1 11 0v5l1.5 2H5zM10 20.5a2 2 0 0 0 4 0",
  arrowUpRight: "M7 17L17 7M8 7h9v9",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  minus: "M6 12h12",
  expand: "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7",
  collapse: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
  chevronUp: "M6 15l6-6 6 6",
  target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 17, strokeWidth = 1.7, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/** The four-point "spark" — Sparq's brand glyph and the Ask Sparq symbol. Filled. */
export function SparkGlyph({ size = 16, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2.5l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
    </svg>
  );
}

/** "Fill a role" glyph: single person. */
export function RoleGlyph({ size = 15, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/** "Build a team" glyph: connected nodes. */
export function TeamGlyph({ size = 15, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="20" r="2" />
      <path d="M7 7l3 3M17 7l-3 3M12 15v3" />
    </svg>
  );
}
