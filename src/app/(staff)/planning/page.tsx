import { PlannedModule } from "@/features/shell/PlannedModule";
export const metadata = { title: "Planning" };
export default function Page() {
  return <PlannedModule light="Who’s free," strong="and when." phase="phase 2" specAnchor="§11 Resource Planning" designFile="v4-planning.dc.html"
    summary="Resource Planning shows a week/month availability timeline, kick-offs and pending end dates, computed from assignments in the database (not a static snapshot)." />;
}
