import type { Metadata, Viewport } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  applicationName: "Canary",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Canary" },
  description:
    "Local web viewer for canary sessions — browse, organize, and search recorded sessions.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: { default: "Canary", template: "%s · Canary" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f9f9f9",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={cn("font-sans", inter.variable)} lang="en">
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
