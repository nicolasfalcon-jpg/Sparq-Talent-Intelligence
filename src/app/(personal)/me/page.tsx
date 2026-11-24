import Link from "next/link";
import { PlannedModule } from "@/features/shell/PlannedModule";
export const metadata = { title: "My space" };
export default function Page() {
  return (
    <>
      <PlannedModule light="My" strong="space." phase="phase 2" specAnchor="§6 My Space" designFile="v4-me.dc.html"
        summary="My Space shows Now / Next, opportunities that match your documented skills and interests, and lets you express interest. Your Talent Passport is already available." />
      <div className="mx-auto -mt-[100px] max-w-page px-10 pb-24 max-xl:px-5"><Link className="text-sm underline underline-offset-4" href="/me/passport">Open my Talent Passport →</Link></div>
    </>
  );
}
