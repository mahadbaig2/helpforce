import type { Document } from "./domain";

/** Builds a small one-page PDF of the document text for seeded attachments without a bundled file. */
export function samplePdf(doc: Pick<Document, "title" | "type" | "id" | "body">) {
  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[\\()]/g, "\\$&");
  const lines = doc.body
    .split(/\n\s*\n/)
    .flatMap((paragraph) => [
      ...paragraph.split(/\s+/).reduce<string[]>((all, word) => {
        const last = all.length - 1;
        if (last < 0 || all[last].length + word.length + 1 > 85) all.push(word);
        else all[last] += ` ${word}`;
        return all;
      }, []),
      "",
    ]);
  const stream = [
    `BT /F1 17 Tf 54 738 Td (${clean(doc.title)}) Tj`,
    `/F1 10 Tf 0 -24 Td (${clean(`${doc.type} document | ${doc.id} | Supporting copy`)}) Tj`,
    ...lines.slice(0, 50).map((line) => `0 -14 Td (${clean(line)}) Tj`),
    "ET\n",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(output);
}
