/**
 * Illustrated portraits — FICTIONAL people only. Ported 1:1 from V4.2 `v3-portrait`.
 * Never replace with photos of real employees in demo mode. In production, a real
 * profile photo (with consent) can be rendered instead, falling back to this illustration.
 */
const FRONT = {
  cap: "M34 40 C34 26 42 21 50 21 C59 21 66 27 66 40 C63 33 57 30 50 30 C43 30 37 33 34 40 Z",
  wavy: "M33 41 C32 27 41 20 50 20 C60 20 68 27 67 41 C65 35 62 33 58 33 C56 30 53 30 50 31 C47 29 43 30 41 33 C38 33 35 35 33 41 Z",
  buzz: "M35.5 35 C37 27 43 23.5 50 23.5 C57 23.5 63 27 64.5 35 C60 31 55 30 50 30 C45 30 40 31 35.5 35 Z",
  fringe: "M34 40 C35 27 42 22 50 22 C58 22 66 27 66 40 C61 31 52 29 44 33 C40 35 36 37 34 40 Z",
  side: "M34 42 C34 27 42 21 51 21 C60 21 66 28 66 38 C60 30 49 28 40 34 C37 36 35 39 34 42 Z",
} as const;
const BACK = {
  none: "",
  long: "M31 44 C30 26 39 19 50 19 C61 19 70 26 69 44 L70 75 C64 78 58 77 56 75 L56 52 L44 52 L44 75 C42 77 36 78 30 75 Z",
  bob: "M31 44 C30 27 39 20 50 20 C61 20 70 27 69 44 L69 60 C64 62 60 61 58 60 L58 48 L42 48 L42 60 C40 61 36 62 31 60 Z",
  curly: "M50 14 C62 13 70 19 72 29 C77 33 78 41 74 47 C76 53 72 59 66 60 L34 60 C28 59 24 53 26 47 C22 41 23 33 28 29 C30 19 38 15 50 14 Z",
} as const;
const BEARD = "M36 44 C37 58 44 63 50 63 C56 63 63 58 64 44 C61 51 57 54 50 54 C43 54 39 51 36 44 Z";
const SKIN = { a: "#F1D2BC", b: "#E2B08C", c: "#C98E66", d: "#A56C49", e: "#7B4B33" } as const;
const HAIR = { dark: "#2E2320", brown: "#5B3B29", black: "#1C1918", auburn: "#8B4028", grey: "#A29C96", blonde: "#C8A266" } as const;

type Spec = { name: string; skin: string; hair: string; back: keyof typeof BACK; front: keyof typeof FRONT; shirt: string; bg: string; beard?: boolean };

export const PORTRAITS: Record<string, Spec> = {
  ana: { name: "Ana Ruiz", skin: SKIN.b, hair: HAIR.brown, back: "long", front: "fringe", shirt: "#2F3A4A", bg: "#FFE4D6" },
  lucia: { name: "Lucía Fernández", skin: SKIN.c, hair: HAIR.dark, back: "curly", front: "fringe", shirt: "#4A4E57", bg: "#EEE9F6" },
  javier: { name: "Javier Morales", skin: SKIN.b, hair: HAIR.dark, back: "none", front: "cap", shirt: "#6F8070", bg: "#E3EFF0", beard: true },
  ethan: { name: "Ethan Brooks", skin: SKIN.a, hair: HAIR.blonde, back: "none", front: "side", shirt: "#2F3A4A", bg: "#E8EEF6" },
  sofia: { name: "Sofía Martínez", skin: SKIN.a, hair: HAIR.auburn, back: "long", front: "side", shirt: "#4A4E57", bg: "#F4EDE4" },
  camila: { name: "Camila Duarte", skin: SKIN.c, hair: HAIR.black, back: "bob", front: "fringe", shirt: "#6F8070", bg: "#EAF3EC" },
  daniel: { name: "Daniel Okafor", skin: SKIN.e, hair: HAIR.black, back: "none", front: "buzz", shirt: "#C9D6E3", bg: "#E8EEF6", beard: true },
  mateo: { name: "Mateo Silva", skin: SKIN.c, hair: HAIR.brown, back: "none", front: "wavy", shirt: "#2F3A4A", bg: "#F4EDE4" },
  valentina: { name: "Valentina Rojas", skin: SKIN.b, hair: HAIR.black, back: "long", front: "fringe", shirt: "#8E5A4A", bg: "#FFE9DF" },
  marcus: { name: "Marcus Chen", skin: SKIN.a, hair: HAIR.grey, back: "none", front: "side", shirt: "#4A4E57", bg: "#EAF3EC" },
  priya: { name: "Priya Nair", skin: SKIN.d, hair: HAIR.black, back: "long", front: "side", shirt: "#2F3A4A", bg: "#F6E6EE" },
  tomas: { name: "Tomás Herrera", skin: SKIN.c, hair: HAIR.black, back: "none", front: "cap", shirt: "#8D99A6", bg: "#F0F0F3" },
  rafael: { name: "Rafael Ortiz", skin: SKIN.b, hair: HAIR.dark, back: "none", front: "side", shirt: "#4A4E57", bg: "#E3EFF0", beard: true },
  ines: { name: "Inés Vidal", skin: SKIN.a, hair: HAIR.black, back: "bob", front: "fringe", shirt: "#8E5A4A", bg: "#F4EDE4" },
  admin: { name: "Admin Demo", skin: SKIN.d, hair: HAIR.grey, back: "none", front: "buzz", shirt: "#2F3A4A", bg: "#F0F0F3" },
  laura: { name: "Laura Gómez", skin: SKIN.a, hair: HAIR.brown, back: "bob", front: "side", shirt: "#2F3A4A", bg: "#F0F0F3" },
};

/** Same illustration as a standalone SVG string (used by GET /portraits/<id> for exports and design tools). */
export function portraitSvg(who: string, size = 256): string | null {
  const p = PORTRAITS[who];
  if (!p) return null;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`,
    `<title>Illustrated portrait of ${p.name} (fictional)</title>`,
    `<rect width="100" height="100" fill="${p.bg}"/>`,
    `<circle cx="78" cy="22" r="26" fill="#fff" opacity=".35"/>`,
    BACK[p.back] ? `<path d="${BACK[p.back]}" fill="${p.hair}"/>` : "",
    `<path d="M12 106 C14 81 30 70 50 70 C70 70 86 81 88 106 Z" fill="${p.shirt}"/>`,
    `<path d="M43 52 H57 V68 C57 72 43 72 43 68 Z" fill="${p.skin}"/>`,
    `<path d="M43 58 H57 V62 C53 64 47 64 43 62 Z" fill="#000" opacity=".08"/>`,
    `<path d="M42 70 L50 80 L58 70 C55 69 45 69 42 70 Z" fill="${p.skin}"/>`,
    `<ellipse cx="50" cy="41" rx="15" ry="18" fill="${p.skin}"/>`,
    `<path d="${FRONT[p.front]}" fill="${p.hair}"/>`,
    p.beard ? `<path d="${BEARD}" fill="${p.hair}" opacity=".85"/>` : "",
    `</svg>`,
  ].join("");
}

export function Portrait({ who, size = 64, decorative = false }: { who: string; size?: number; decorative?: boolean }) {
  const p = PORTRAITS[who] ?? PORTRAITS.ana!;
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `Illustrated portrait of ${p.name}`}
      aria-hidden={decorative || undefined}
      className="inline-flex flex-none overflow-hidden rounded-full align-middle"
      style={{ width: size, height: size }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" fill={p.bg} />
        <circle cx="78" cy="22" r="26" fill="#fff" opacity=".35" />
        {BACK[p.back] && <path d={BACK[p.back]} fill={p.hair} />}
        <path d="M12 106 C14 81 30 70 50 70 C70 70 86 81 88 106 Z" fill={p.shirt} />
        <path d="M43 52 H57 V68 C57 72 43 72 43 68 Z" fill={p.skin} />
        <path d="M43 58 H57 V62 C53 64 47 64 43 62 Z" fill="#000" opacity=".08" />
        <path d="M42 70 L50 80 L58 70 C55 69 45 69 42 70 Z" fill={p.skin} />
        <ellipse cx="50" cy="41" rx="15" ry="18" fill={p.skin} />
        <path d={FRONT[p.front]} fill={p.hair} />
        {p.beard && <path d={BEARD} fill={p.hair} opacity=".85" />}
      </svg>
    </span>
  );
}
