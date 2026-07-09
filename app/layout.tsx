import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Agent Breach Replay",
  description:
    "Security observability and replay studio for tool-using AI agents.",
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
