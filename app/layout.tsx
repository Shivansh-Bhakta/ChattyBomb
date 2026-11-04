import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "ChattyBomb", description: "One inbox for WhatsApp, Slack and Email, answered by AI." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
