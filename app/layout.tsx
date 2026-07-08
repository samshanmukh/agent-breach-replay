import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Agent Breach Replay",
  description: "A visual replay studio for AI-agent security failures.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
