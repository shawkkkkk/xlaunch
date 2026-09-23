"use client";

import { useEffect, useState } from "react";
import {
  useCreateWallet as useCreateEvmWallet,
  useExportWallet as useExportEvmWallet,
  usePrivy,
} from "@privy-io/react-auth";
import {
  useCreateWallet as useCreateSolanaWallet,
  useExportWallet as useExportSolanaWallet,
} from "@privy-io/react-auth/solana";

type WalletChain = "ethereum" | "solana";

function compact(address?: string | null) {
  if (!address) return "NOT PROVISIONED";
  if (address.length < 16) return address;
  return address.slice(0, 7) + "…" + address.slice(-6);
}

function WalletCard({
  title,
  networks,
  address,
  creating,
  onCreate,
  onExport,
}: {
  title: string;
  networks: string;
  address: string;
  creating: boolean;
  onCreate: () => void;
  onExport: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className="profileWalletCard">
      <div className="profileWalletTop">
        <div>
          <span>{networks}</span>
          <h3>{title}</h3>
        </div>
        {address ? (
          <i>ACTIVE</i>
        ) : (
          <button
            className="walletCreateButton"
            type="button"
            disabled={creating}
            onClick={onCreate}
          >
            {creating ? "CREATING…" : "CREATE WALLET"}
          </button>
        )}
      </div>

      <code>{address || "Create a self-custodial Privy wallet for this XLaunch profile."}</code>

      <div className="walletActions">
        <button disabled={!address} onClick={copyAddress}>
          {copied ? "COPIED" : "RECEIVE"}
        </button>
        <button disabled> SEND </button>
        <button disabled> SWAP </button>
        <button disabled> BRIDGE </button>
        <button
          className="dangerAction"
          disabled={!address}
          onClick={onExport}
        >
          EXPORT KEY
        </button>
      </div>

      {!address && (
        <p>
          Creation is user-controlled through Privy. The first creation will ask you
          to authenticate with X, then the wallet is linked back to this XLaunch profile.
        </p>
      )}
    </article>
  );
}

export default function PrivyWalletPanel({
  xHandle,
  initialEvmAddress,
  initialSolanaAddress,
}: {
  xHandle: string;
  initialEvmAddress?: string | null;
  initialSolanaAddress?: string | null;
}) {
  const { ready, authenticated, user, login } = usePrivy();
  const { createWallet: createEvmWallet } = useCreateEvmWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();
  const { exportWallet: exportEvmWallet } = useExportEvmWallet();
  const { exportWallet: exportSolanaWallet } = useExportSolanaWallet();

  const [evmAddress, setEvmAddress] = useState(initialEvmAddress || "");
  const [solanaAddress, setSolanaAddress] = useState(initialSolanaAddress || "");
  const [creating, setCreating] = useState<WalletChain | null>(null);
  const [pendingCreate, setPendingCreate] = useState<WalletChain | null>(null);
  const [status, setStatus] = useState("");

  function twitterHandle() {
    const account = (user?.linkedAccounts as any[] | undefined)?.find(
      (item) => item?.type === "twitter_oauth",
    );
    return String(account?.username || "").replace(/^@/, "");
  }

  function assertMatchingXIdentity() {
    const privyHandle = twitterHandle();
    if (!privyHandle) {
      throw new Error("Authenticate with X in the Privy window before creating an embedded wallet.");
    }
    if (privyHandle.toLowerCase() !== xHandle.replace(/^@/, "").toLowerCase()) {
      throw new Error(
        `Privy is authenticated as @${privyHandle}, but this XLaunch profile is @${xHandle}. Use the same X account.`,
      );
    }
  }

  function existingWallet(chain: WalletChain) {
    return (user?.linkedAccounts as any[] | undefined)?.find(
      (item) =>
        item?.type === "wallet" &&
        item?.walletClientType === "privy" &&
        item?.chainType === chain,
    );
  }

  async function syncWallet(chain: WalletChain, address: string) {
    const response = await fetch("/api/profile/wallets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain, address }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not save wallet to XLaunch.");

    if (chain === "ethereum") setEvmAddress(address);
    else setSolanaAddress(address);
  }

  async function create(chain: WalletChain) {
    setCreating(chain);
    setStatus("");
    try {
      assertMatchingXIdentity();

      const found = existingWallet(chain);
      if (found?.address) {
        await syncWallet(chain, String(found.address));
        setStatus(
          `${chain === "ethereum" ? "EVM" : "Solana"} Privy wallet linked to your XLaunch profile.`,
        );
        return;
      }

      const wallet =
        chain === "ethereum"
          ? await createEvmWallet()
          : await createSolanaWallet();

      const address = String((wallet as any)?.address || "");
      if (!address) throw new Error("Privy created a wallet but returned no address.");

      await syncWallet(chain, address);
      setStatus(
        `${chain === "ethereum" ? "EVM" : "Solana"} wallet created and linked to @${xHandle}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet creation failed.");
    } finally {
      setCreating(null);
    }
  }

  function requestCreate(chain: WalletChain) {
    if (!ready) {
      setStatus("Privy is still loading. Try again in a moment.");
      return;
    }
    if (!authenticated) {
      setPendingCreate(chain);
      setStatus("Authenticate with the same X account to create your wallet…");
      login();
      return;
    }
    void create(chain);
  }

  useEffect(() => {
    if (!ready || !authenticated || !pendingCreate) return;
    const chain = pendingCreate;
    setPendingCreate(null);
    void create(chain);
    // create is intentionally invoked after Privy authentication completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, pendingCreate]);

  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    try {
      assertMatchingXIdentity();
    } catch {
      return;
    }

    const evm = existingWallet("ethereum");
    const solana = existingWallet("solana");

    if (!evmAddress && evm?.address) {
      void syncWallet("ethereum", String(evm.address)).catch(() => {});
    }
    if (!solanaAddress && solana?.address) {
      void syncWallet("solana", String(solana.address)).catch(() => {});
    }
    // Sync an existing Privy wallet once after authentication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user]);

  async function exportKey(chain: WalletChain) {
    setStatus("");
    try {
      assertMatchingXIdentity();
      if (chain === "ethereum") {
        if (!evmAddress) throw new Error("Create the EVM wallet first.");
        await exportEvmWallet({ address: evmAddress });
      } else {
        if (!solanaAddress) throw new Error("Create the Solana wallet first.");
        await exportSolanaWallet({ address: solanaAddress });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Key export failed.");
    }
  }

  return (
    <>
      <div className="profileWalletGrid">
        <WalletCard
          title="EVM WALLET"
          networks="ETHEREUM + ROBINHOOD CHAIN"
          address={evmAddress}
          creating={creating === "ethereum"}
          onCreate={() => requestCreate("ethereum")}
          onExport={() => void exportKey("ethereum")}
        />
        <WalletCard
          title="SOLANA WALLET"
          networks="SOLANA"
          address={solanaAddress}
          creating={creating === "solana"}
          onCreate={() => requestCreate("solana")}
          onExport={() => void exportKey("solana")}
        />
      </div>

      {status && <div className="walletProvisionStatus">{status}</div>}

      <div className="keySafety">
        <b>PRIVATE KEY EXPORT</b>
        <p>
          Private-key export opens Privy&apos;s isolated export interface. XLaunch
          does not receive, log, store, or display the exported private key.
        </p>
      </div>
    </>
  );
}
