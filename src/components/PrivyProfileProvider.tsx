"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export default function PrivyProfileProvider({
  appId,
  children,
}: {
  appId: string;
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["twitter"],
        appearance: {
          theme: "dark",
          accentColor: "#ffffff",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
