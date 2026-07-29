import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aurum Sourcing — Canadian Jewelry Research",
  description: "Research, qualify, and export evidence-backed Canadian jewelry sellers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
