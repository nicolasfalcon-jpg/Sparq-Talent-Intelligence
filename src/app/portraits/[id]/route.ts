import { portraitSvg } from "@/design-system/Portrait";

/** GET /portraits/<id> (optionally with .svg) — illustrated fictional portrait as a standalone SVG. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const svg = portraitSvg(id.replace(/\.svg$/, ""));
  if (!svg) return new Response("Not found", { status: 404 });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
