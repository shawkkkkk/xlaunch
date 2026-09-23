import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const icon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='black'/%3E%3Cpath d='M5 5L19 19M19 5L5 19' stroke='white' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  metadataBase: new URL("https://xlaunch.it"),
  title: "XLaunch — One post. One token. Forever.",
  description:
    "Turn an X post into one canonical token through Pump.fun, StonkFun, or Pons.",
  icons: { icon },
  openGraph: {
    title: "XLaunch",
    description: "One post. One token. One chain. Forever.",
    url: "https://xlaunch.it",
    siteName: "XLaunch",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "XLaunch",
    description: "One post. One token. One chain. Forever.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ background: "#000000", color: "#ffffff" }}>
      <body style={{ background: "#000000", color: "#ffffff" }}>{children}</body>
    </html>
  );
}
