import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stephen — Portfolio OS",
  description:
    "A full-stack developer portfolio presented as a custom, interactive operating system.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Stephen — Portfolio OS",
    description:
      "Full-stack projects, interface systems, and an interactive recruiter dossier.",
    type: "website",
    images: [{ url: "/og.png", width: 1792, height: 1024, alt: "Stephen — Full-stack Web Developer, Portfolio OS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stephen — Portfolio OS",
    description: "A full-stack developer portfolio.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
