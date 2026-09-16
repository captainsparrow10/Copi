import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Variable names match app/globals.css's `@theme inline` tokens
// (`--font-sans`/`--font-mono`, written by `npx shadcn init`) — the CLI
// doesn't rewrite this file, so it has to be kept in sync by hand.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Copi — Estimador de copago",
  description: "Antes de atenderte, sabe qué especialidad te conviene, cuánto pagarás y en qué hospital te sale más económico.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
