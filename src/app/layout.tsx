import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AP Payment Fraud Sentinel · RocketRide",
  description:
    "Out-of-band verification as software. The only AP control that catches Business Email Compromise — humans skip it because it's boring, so we ship it as software. 7-stage RocketRide pipeline.",
  keywords: [
    "AP fraud",
    "Business Email Compromise",
    "RocketRide",
    "verification call",
    "financial crime ops",
  ],
  authors: [{ name: "RocketRide Buildathon PS #4" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "AP Payment Fraud Sentinel",
    description: "Out-of-band verification as software. Built on RocketRide.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
