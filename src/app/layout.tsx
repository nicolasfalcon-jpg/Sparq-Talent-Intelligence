import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/features/shell/Providers";

export const metadata: Metadata = {
  title: { default: "Sparq Talent Intelligence", template: "%s · Sparq Talent Intelligence" },
  description: "Connecting the right talent with the right opportunities. Fictional demo data.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
