"use client";

import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console for local debugging.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-10">
      <Alert className="max-w-md" variant="destructive">
        <CircleAlert />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          {error.message || "An unexpected error occurred."}
        </AlertDescription>
      </Alert>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </main>
  );
}
