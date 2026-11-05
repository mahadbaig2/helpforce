import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helpforce | Document approvals",
  description: "Local document approval workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
