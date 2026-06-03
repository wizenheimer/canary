import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-5 animate-spin text-faint" />
    </main>
  );
}
