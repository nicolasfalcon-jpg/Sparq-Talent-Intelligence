import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPassportView } from "@/features/passport/queries";
import { PassportPage } from "@/features/passport/PassportPage";

export const metadata = { title: "My Talent Passport" };

export default async function MyPassport() {
  const user = await getSessionUser();
  if (!user.personId) notFound();
  const view = await getPassportView(user.personId, null);
  if (!view) notFound();
  return <PassportPage view={view} mode="personal" />;
}
