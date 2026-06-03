import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { Separator } from "./ui/separator";

// Minimal shared top bar (wordmark + optional breadcrumb) so the library and
// the session detail view share one chrome and don't shift layout.
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-6">
        <Link
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <Logo />
        </Link>
        {children ? (
          <>
            <Separator className="!h-5" orientation="vertical" />
            {children}
          </>
        ) : null}
      </div>
    </header>
  );
}
