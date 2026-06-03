import type { Metadata } from "next";
import SessionView from "@/components/session-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; root: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id) };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; root: string }>;
}) {
  const { id, root } = await params;
  return <SessionView id={id} rootId={root} />;
}
