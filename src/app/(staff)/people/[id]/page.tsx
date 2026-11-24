import { notFound } from "next/navigation";
import { getRepositories } from "@/data/repositories";
import { getSessionUser } from "@/lib/session";
import { getPassportView } from "@/features/passport/queries";
import { PassportPage } from "@/features/passport/PassportPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agg = await getRepositories().talent.getPerson(id);
  return { title: agg ? `${agg.person.name} · Talent Passport` : "Talent Passport" };
}

export default async function StaffPassport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const view = await getPassportView(id, user.id);
  if (!view) notFound();
  return <PassportPage view={view} mode="staff" />;
}
