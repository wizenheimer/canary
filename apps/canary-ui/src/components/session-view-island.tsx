import { NuqsAdapter } from "nuqs/adapters/react";
import SessionView from "@/components/session-view";

// Island root for the session detail page — see library-island.tsx for why
// the nuqs adapter mounts here.
export default function SessionViewIsland({
  id,
  rootId,
}: {
  id: string;
  rootId: string;
}) {
  return (
    <NuqsAdapter>
      <SessionView id={id} rootId={rootId} />
    </NuqsAdapter>
  );
}
