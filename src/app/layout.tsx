import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "intalent Joining Assurance",
  description: "Every offer deserves a successful Day 1.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
