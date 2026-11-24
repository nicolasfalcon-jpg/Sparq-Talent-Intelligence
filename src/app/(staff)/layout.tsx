import type { ReactNode } from "react";
import { AppFrame } from "@/features/shell/AppFrame";

export const dynamic = "force-dynamic";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <AppFrame mode="staff">{children}</AppFrame>;
}
