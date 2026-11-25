import type { ReactNode } from "react";
import { AppFrame } from "@/features/shell/AppFrame";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppFrame mode="admin">{children}</AppFrame>;
}
