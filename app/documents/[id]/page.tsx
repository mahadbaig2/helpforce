import DocumentView from "@/components/document-view";

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  // Keyed so moving to the next document starts with fresh reading progress.
  return <DocumentView key={id} id={id} />;
}
