import type { ReactNode } from "react";
import { Logo } from "./logo";

// Minimal shared top bar (wordmark + optional breadcrumb) so the library and
// the session detail view share one chrome and don't shift layout.
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header>
      <div className="flex h-14 w-full items-center gap-3 px-6">
        <a
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <Logo />
        </a>
        {children}
      </div>
    </header>
  );
}
