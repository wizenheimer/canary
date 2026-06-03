import SessionView from "@/components/session-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; root: string }>;
}) {
  const { id, root } = await params;
  return <SessionView id={id} rootId={root} />;
}
