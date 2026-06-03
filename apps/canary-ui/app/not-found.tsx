import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-10 text-center">
      <Logo />
      <div>
        <h1 className="font-bold text-2xl tracking-tight">Page not found</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          That session or page doesn&rsquo;t exist.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Back to sessions</Link>
      </Button>
    </main>
  );
}
