import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://xlaunch.it"),
  title: "XLaunch — One post. One token. One chain. Forever.",
  description: "Turn an X post into one canonical token on StonkFun or Pons.",
  openGraph: {
    title: "XLaunch",
    description: "One post. One token. One chain. Forever.",
    url: "https://xlaunch.it",
    siteName: "XLaunch",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
