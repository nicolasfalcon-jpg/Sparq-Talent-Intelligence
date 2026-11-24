import { notFound } from "next/navigation";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getPassportView } from "@/features/passport/queries";
import { PassportPage } from "@/features/passport/PassportPage";

export const metadata = { title: "My Talent Passport" };

export default async function MyPassport() {
  const user = await getSessionUser();
  if (!user.personId) notFound();
  // The person id comes from the session, never from the URL.
  const view = await guardPage(user, () => getPassportView(user.personId!, user));
  if (!view) notFound();
  return <PassportPage view={view} mode="personal" />;
}
