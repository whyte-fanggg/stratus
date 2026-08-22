import "./globals.css";
import "./redesign.css";

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Stratus — Multi-client AWS operations",
  description:
    "Read-only AWS infrastructure, backup, network, IAM, alert, and billing visibility for four managed clients.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Stratus — Multi-client AWS operations",
    description: "A calm, source-backed AWS operations workspace.",
    type: "website",
    images: [{ url: "/og.png", width: 1792, height: 1024, alt: "Stratus AWS operations dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stratus — Multi-client AWS operations",
    description: "A calm, source-backed AWS operations workspace.",
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
      <body>{children}</body>
    </html>
  );
}
