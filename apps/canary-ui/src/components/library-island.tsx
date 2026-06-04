import { NuqsAdapter } from "nuqs/adapters/react";
import Library from "@/components/library";

// Island root for the library page. nuqs needs its adapter inside the React
// tree; the framework-agnostic `react` adapter drives URL state through the
// History API (the Next app-router adapter lived in app/layout.tsx).
export default function LibraryIsland() {
  return (
    <NuqsAdapter>
      <Library />
    </NuqsAdapter>
  );
}
