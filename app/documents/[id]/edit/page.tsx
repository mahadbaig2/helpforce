import DocumentForm from "@/components/document-form";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentForm key={id} id={id} />;
}
