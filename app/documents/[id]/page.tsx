import DocumentView from "@/components/document-view";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed so moving to the next document starts with fresh reading progress.
  return <DocumentView key={id} id={id} />;
}
