import "server-only";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/domain/errors";
import type { AppUser } from "@/domain/schemas";

/** Where a user belongs: staffing leads in the staff workspace, engineers in their own space. */
export const homeFor = (user: Pick<AppUser, "role">): string => (user.role === "engineer" ? "/me" : "/");

/**
 * Page-level guard. Queries throw a typed `ForbiddenError` when the viewer may not read something; a page turns that
 * into the same redirect the layout performs, so an unauthorised page never renders (and never errors) whichever of the
 * layout and the page notices first. The query is what protects the data; this only decides what the visitor sees.
 */
export async function guardPage<T>(viewer: AppUser, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof ForbiddenError) redirect(homeFor(viewer));
    throw e;
  }
}
