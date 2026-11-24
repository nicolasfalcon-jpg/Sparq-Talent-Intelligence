import { notFound } from "next/navigation";
import { guardPage } from "@/lib/access";
import { getSessionUser } from "@/lib/session";
import { getPassportTitle, getPassportView } from "@/features/passport/queries";
import { PassportPage } from "@/features/passport/PassportPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  // Same authorization as the page: a forbidden viewer gets a generic title, never the person's name.
  return { title: await getPassportTitle(id, user).catch(() => "Talent Passport") };
}

export default async function StaffPassport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const view = await guardPage(user, () => getPassportView(id, user));
  if (!view) notFound();
  return <PassportPage view={view} mode="staff" />;
}
