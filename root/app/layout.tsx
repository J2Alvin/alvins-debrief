import "./globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alvin's Debrief",
  description: "Executive daily news summary.",
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
