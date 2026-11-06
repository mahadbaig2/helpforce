import DocumentForm from "@/components/document-form";

export default async function EditDocumentPage({ params }: PageProps<"/documents/[id]/edit">) {
  const { id } = await params;
  return <DocumentForm key={id} id={id} />;
}
