"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  availableEvmWallets,
  connectRobinhoodWallet,
  launchOnPons,
  signRobinhoodMessage,
  type EvmWalletChoice,
} from "@/lib/pons-browser";
import {
  availableSolanaWallets,
  connectSolanaWallet,
  launchOnPump,
  signSolanaMessage,
  type SolanaWalletChoice,
} from "@/lib/pump-browser";
import { launchOnStonkFun } from "@/lib/stonkfun-browser";

type Registry = {
  status: "reserved" | "live";
  venue: "stonkfun" | "pons" | "pumpfun";
  chain: "solana" | "robinhood";
  token_address: string | null;
  tx_hash: string | null;
  reserver_wallet: string;
  reservation_expires_at: string | null;
};

type Resolved = {
  post: {
    id: string;
    sourceKey: string;
    canonicalUrl: string;
    text: string;
    authorName: string;
    handle: string;
    media: Array<{
      type: "photo" | "video" | "animated_gif";
      url: string;
    }>;
  };
  registry: Registry | null;
  registryConfigured: boolean;
};

type Pair = {
  mint?: string;
  symbol?: string;
  name?: string;
  category?: string;
  tokenProgram?: string;
};

type PumpCaps = {
  holderRewardsEnabled: boolean;
  quotes: Array<{
    mint: string;
    symbol?: string;
    source: "sol" | "global" | "quoteControl";
    initialVirtualQuoteReserves?: string | null;
  }>;
  options: {
    mayhemMode: boolean;
    holderRewards: boolean;
    initialBuy: boolean;
    creatorFeeSharing: boolean;
    maxFeeShareholders: number;
    customCreatorFeeForEligiblePairs: boolean;
  };
};

type DonateCharity = {
  id: string;
  slug: string;
  name: string;
  logo: string;
  website: string;
  mission: string;
  country: string;
  status: string;
  isEnabled: boolean;
};

type FeatureFlags = {
  xMoney: { solana: boolean; robinhood: boolean };
  charity: { pumpfun: boolean };
  xAuth: boolean;
  embeddedWallets: boolean;
  bot: boolean;
};

type PonsCaps = {
  launchEnabled: boolean;
  launchFeeEth: string;
  maxCreatorTaxBps: number;
  snipeTaxStartBps: number;
  snipeTaxSeconds: number;
  configs: Array<{
    id: number;
    curveFeeBps: number;
    enabled: boolean;
    supply: string;
    phantomQuote: string;
    graduationThreshold: string;
  }>;
};

function XBrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`xBrandMark ${className}`.trim()}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

const TOKEN_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function squareTokenImage(file: File, size = 512): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!TOKEN_IMAGE_TYPES.has(file.type)) {
      reject(new Error("Use a PNG, JPG, or WEBP image."));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      reject(new Error("Choose an image smaller than 20 MB."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const source = new Image();

    source.onload = () => {
      try {
        const side = Math.min(source.naturalWidth, source.naturalHeight);
        if (!side) throw new Error("Could not read this image.");

        const sx = Math.floor((source.naturalWidth - side) / 2);
        const sy = Math.floor((source.naturalHeight - side) / 2);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this image.");

        context.drawImage(source, sx, sy, side, side, 0, 0, size, size);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error("Could not process this image."));
              return;
            }
            resolve(
              new File(
                [blob],
                `${file.name.replace(/\.[^.]+$/, "") || "token"}-square.png`,
                { type: "image/png" },
              ),
            );
          },
          "image/png",
          0.95,
        );
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    source.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read this image."));
    };

    source.src = objectUrl;
  });
}

function suggestedTicker(handle: string, text: string) {
  const firstWord = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)[0];
  return (firstWord || handle || "POST").replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
}

export default function XLaunchApp() {
  const [url, setUrl] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [loading, setLoading] = useState(false);
  const [venue, setVenue] = useState<"stonkfun" | "pons" | "pumpfun">("stonkfun");

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [imageMode, setImageMode] = useState<"upload" | "post" | "url">("upload");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [uploadedImagePreview, setUploadedImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [draggingImage, setDraggingImage] = useState(false);
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [discord, setDiscord] = useState("");
  const [farcaster, setFarcaster] = useState("");

  const [stonkPairs, setStonkPairs] = useState<Pair[]>([]);
  const [stonkPair, setStonkPair] = useState("");
  const [stonkMode, setStonkMode] = useState<"standard" | "reward">("standard");
  const [stonkPricing, setStonkPricing] = useState<any>(null);
  const [rewardBps, setRewardBps] = useState(0);
  const [stonkDevBuy, setStonkDevBuy] = useState("0");

  const [pons, setPons] = useState<PonsCaps | null>(null);
  const [ponsConfig, setPonsConfig] = useState(0);
  const [ponsPair, setPonsPair] = useState("ETH");
  const [ponsPairState, setPonsPairState] = useState<any>(null);
  const [creatorTax, setCreatorTax] = useState(0);
  const [buyback, setBuyback] = useState(false);
  const [devBuy, setDevBuy] = useState("0");
  const [buyRecipient, setBuyRecipient] = useState("");
  const [exemptions, setExemptions] = useState("");
  const [salt, setSalt] = useState("");

  const [pump, setPump] = useState<PumpCaps | null>(null);
  const [pumpQuote, setPumpQuote] = useState("");
  const [pumpMayhem, setPumpMayhem] = useState(false);
  const [pumpHolderReward, setPumpHolderReward] = useState(false);
  const [pumpCreatorFeeBps, setPumpCreatorFeeBps] = useState(0);
  const [pumpOpeningBuy, setPumpOpeningBuy] = useState("0");

  const [feeRoute, setFeeRoute] = useState<
    "author_xmoney" | "developer" | "custom" | "charity"
  >("developer");
  const [customFeeWallet, setCustomFeeWallet] = useState("");
  const [charityQuery, setCharityQuery] = useState("");
  const [charities, setCharities] = useState<DonateCharity[]>([]);
  const [selectedCharity, setSelectedCharity] = useState<DonateCharity | null>(null);
  const [charitySearching, setCharitySearching] = useState(false);
  const [charityRoutingConfigured, setCharityRoutingConfigured] = useState<boolean | null>(null);

  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState("");
  const [launching, setLaunching] = useState(false);
  const [pendingLaunch, setPendingLaunch] = useState<{
    wallet: string;
    txHash: string;
    tokenAddress: string;
    postId: string;
    venue: "stonkfun" | "pons" | "pumpfun";
  } | null>(null);
  const [solWallet, setSolWallet] = useState("");
  const [solWalletProvider, setSolWalletProvider] = useState<SolanaWalletChoice | "">("");
  const [solWalletOptions, setSolWalletOptions] = useState<Array<{ id: SolanaWalletChoice; label: string }>>([]);
  const [evmWallet, setEvmWallet] = useState("");
  const [evmWalletProvider, setEvmWalletProvider] = useState<EvmWalletChoice | "">("");
  const [evmWalletOptions, setEvmWalletOptions] = useState<Array<{ id: EvmWalletChoice; label: string }>>([]);
  const [socialCommandId, setSocialCommandId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [features, setFeatures] = useState<FeatureFlags>({
    xMoney: { solana: false, robinhood: false },
    charity: { pumpfun: false },
    xAuth: false,
    embeddedWallets: false,
    bot: false,
  });
  const socialPrefillApplied = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSolWalletOptions(availableSolanaWallets());
    setEvmWalletOptions(availableEvmWallets());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const media = window.matchMedia("(min-width: 901px)");
    const onResize = () => {
      if (media.matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    media.addEventListener("change", onResize);
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      window.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onResize);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (socialPrefillApplied.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const postId = params.get("post");
    const venueParam = params.get("venue");
    setSocialCommandId(params.get("social") || "");
    if (!postId || !/^\d+$/.test(postId)) return;
    if (!["stonkfun", "pons", "pumpfun"].includes(String(venueParam))) return;

    socialPrefillApplied.current = true;
    const targetUrl = `https://x.com/i/status/${postId}`;
    setUrl(targetUrl);
    setVenue(venueParam as "stonkfun" | "pons" | "pumpfun");

    const route = params.get("feeRoute");
    if (["author_xmoney", "developer", "custom"].includes(String(route))) {
      setFeeRoute(route as "author_xmoney" | "developer" | "custom");
    }
    if (params.get("customFeeWallet")) {
      setCustomFeeWallet(params.get("customFeeWallet") || "");
    }
    if (params.get("stonkMode") === "reward" || params.get("stonkMode") === "standard") {
      setStonkMode(params.get("stonkMode") as "standard" | "reward");
    }
    const rewardPercent = Number(params.get("rewardPercent") || "");
    if (Number.isFinite(rewardPercent) && rewardPercent > 0) {
      setRewardBps(Math.round(rewardPercent * 100));
    }

    void resolvePost(targetUrl, {
      name: params.get("name") || undefined,
      symbol: params.get("symbol") || undefined,
    });
  }, []);

  useEffect(() => {
    fetch("/api/features")
      .then((response) => response.json())
      .then((data) => {
        if (data?.xMoney && data?.charity) setFeatures(data);
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/venues/stonkfun").then((r) => r.json()),
      fetch("/api/venues/pons").then((r) => r.json()),
      fetch("/api/venues/pumpfun").then((r) => r.json()),
    ])
      .then(([stonk, ponsData, pumpData]) => {
        const pairs = Array.isArray(stonk?.pairs) ? stonk.pairs : [];
        setStonkPairs(pairs);
        if (pairs[0]?.mint) setStonkPair(pairs[0].mint);
        if (!ponsData?.error) {
          setPons(ponsData);
          const firstEnabled = ponsData.configs?.find((x: { enabled: boolean }) => x.enabled);
          if (firstEnabled) setPonsConfig(firstEnabled.id);
        }
        if (!pumpData?.error) {
          setPump(pumpData);
          if (pumpData.quotes?.[0]?.mint) setPumpQuote(pumpData.quotes[0].mint);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const xMoneyReady =
      venue === "pons" ? features.xMoney.robinhood : features.xMoney.solana;

    if (
      (feeRoute === "charity" &&
        (venue !== "pumpfun" || !features.charity.pumpfun)) ||
      (feeRoute === "author_xmoney" && !xMoneyReady)
    ) {
      setFeeRoute("developer");
      if (feeRoute === "charity") setSelectedCharity(null);
    }
  }, [venue, feeRoute, features]);

  useEffect(() => {
    if (!stonkPair) return;
    fetch(`/api/venues/stonkfun/pricing?quoteMint=${encodeURIComponent(stonkPair)}`)
      .then((r) => r.json())
      .then((data) => {
        setStonkPricing(data);
        const tiers = data?.modes?.reward?.transferFeeBps ?? [];
        if (tiers.length) setRewardBps(Number(tiers[0]));
      })
      .catch(() => setStonkPricing(null));
  }, [stonkPair]);

  async function resolvePost(
    overrideUrl?: string,
    prefill?: { name?: string; symbol?: string },
  ) {
    setLoading(true);
    setResolveError("");
    setResolved(null);
    setStatus("");

    try {
      const response = await fetch("/api/post/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: overrideUrl || url }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not resolve post.");

      setResolved(body);
      if (
        body.registry?.venue === "stonkfun" ||
        body.registry?.venue === "pumpfun" ||
        body.registry?.venue === "pons"
      ) {
        setVenue(body.registry.venue);
      }
      try {
        const saved = window.localStorage.getItem(`xlaunch:pending:${body.post.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.txHash && parsed?.tokenAddress && parsed?.wallet) {
            setPendingLaunch(parsed);
          }
        } else {
          setPendingLaunch(null);
        }
      } catch {
        setPendingLaunch(null);
      }
      const postMedia = Array.isArray(body.post.media) ? body.post.media : [];
      setImageError("");
      setManualImageUrl("");
      setUploadedImagePreview("");
      if (postMedia[0]?.url) {
        setImageMode("post");
        setImage(String(postMedia[0].url));
      } else {
        setImageMode("upload");
        setImage("");
      }

      const text = String(body.post.text || "");
      const firstSentence = text.replace(/https?:\/\/\S+/g, "").trim().split(/[.!?\n]/)[0].slice(0, 48);
      setName(prefill?.name || firstSentence || body.post.authorName || "X Post");
      setSymbol(
        (prefill?.symbol || suggestedTicker(body.post.handle, text))
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 12),
      );
      setDescription(text.slice(0, 500));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById("launch-builder")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "Could not resolve post.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadTokenImage(file: File) {
    setUploadingImage(true);
    setImageError("");
    setImage("");

    try {
      const square = await squareTokenImage(file, 512);
      const previewUrl = URL.createObjectURL(square);
      setUploadedImagePreview((current) => {
        if (current.startsWith("blob:")) URL.revokeObjectURL(current);
        return previewUrl;
      });

      const formData = new FormData();
      formData.append("file", square);

      const response = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Image upload failed.");
      }

      setImageMode("upload");
      setImage(String(body.url || ""));
      setStatus("Token image uploaded and cropped to 1:1.");
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  }

  function chooseImageFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void uploadTokenImage(file);
  }

  function onImageInput(event: ChangeEvent<HTMLInputElement>) {
    chooseImageFiles(event.target.files);
    event.target.value = "";
  }

  function onImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDraggingImage(false);
    chooseImageFiles(event.dataTransfer.files);
  }

  function selectPostMedia(url: string) {
    setImageMode("post");
    setImage(url);
    setImageError("");
  }

  async function searchCharities() {
    const term = charityQuery.trim();
    if (!term) {
      setCharities([]);
      return;
    }

    setCharitySearching(true);
    try {
      const response = await fetch(
        `/api/donate/charities?term=${encodeURIComponent(term)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Charity search failed.");
      setCharities(Array.isArray(data.charities) ? data.charities : []);
      setCharityRoutingConfigured(Boolean(data.routingConfigured));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Charity search failed.");
    } finally {
      setCharitySearching(false);
    }
  }

  async function validatePonsPair() {
    setPonsPairState({ loading: true });
    try {
      const response = await fetch(
        `/api/venues/pons/pair?address=${encodeURIComponent(ponsPair)}&config=${ponsConfig}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pair rejected.");
      setPonsPairState(data);
    } catch (error) {
      setPonsPairState({ error: error instanceof Error ? error.message : "Pair rejected." });
    }
  }

  const sourceX = resolved?.post.canonicalUrl || "";
  const alreadyLive = resolved?.registry?.status === "live";
  const reserved = resolved?.registry?.status === "reserved";
  const rewardTiers: number[] = stonkPricing?.modes?.reward?.transferFeeBps ?? [];
  const finalWebsite = website.trim() || "https://launchonx.net";

  const selectedPair = useMemo(
    () => stonkPairs.find((pair) => pair.mint === stonkPair),
    [stonkPair, stonkPairs],
  );

  const selectedPumpQuote = useMemo(
    () => pump?.quotes.find((quote) => quote.mint === pumpQuote),
    [pump, pumpQuote],
  );

  const activeWallet = venue === "pons" ? evmWallet : solWallet;

  async function connectCurrentWallet() {
    try {
      setStatus("Connecting wallet…");
      if (venue === "pons") {
        if (!evmWalletProvider) {
          setStatus("Choose an EVM wallet first.");
          return;
        }
        const account = await connectRobinhoodWallet(evmWalletProvider);
        setEvmWallet(account);
        setStatus(`${evmWalletOptions.find((item) => item.id === evmWalletProvider)?.label || "EVM wallet"} connected to Robinhood Chain.`);
      } else {
        if (!solWalletProvider) {
          setStatus("Choose a Solana wallet first.");
          return;
        }
        const account = await connectSolanaWallet(solWalletProvider);
        setSolWallet(account.toBase58());
        setStatus(`${solWalletOptions.find((item) => item.id === solWalletProvider)?.label || "Solana wallet"} connected.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function releaseReservationForRetry() {
    if (!resolved?.registry || resolved.registry.status !== "reserved") return;
    if (pendingLaunch) {
      setStatus("This launch has an onchain transaction pending verification. Retry verification instead of releasing the reservation.");
      return;
    }

    const reservedVenue = resolved.registry.venue;
    setLaunching(true);

    try {
      let wallet = "";

      if (reservedVenue === "pons") {
        if (!evmWalletProvider) {
          throw new Error("Choose the same EVM wallet that created this reservation.");
        }
        wallet = await connectRobinhoodWallet(evmWalletProvider);
        setEvmWallet(wallet);
      } else {
        if (!solWalletProvider) {
          throw new Error("Choose the same Solana wallet that created this reservation.");
        }
        const account = await connectSolanaWallet(solWalletProvider);
        wallet = account.toBase58();
        setSolWallet(wallet);
      }

      const walletMatches =
        reservedVenue === "pons"
          ? wallet.toLowerCase() === resolved.registry.reserver_wallet.toLowerCase()
          : wallet === resolved.registry.reserver_wallet;

      if (!walletMatches) {
        throw new Error("This reservation belongs to a different wallet. Connect the wallet that originally reserved the post.");
      }

      setStatus("Sign once to release the failed reservation…");
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId: resolved.post.id,
          venue: reservedVenue,
          wallet,
        }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) {
        throw new Error(challenge.error || "Could not create release challenge.");
      }

      const proof =
        reservedVenue === "pons"
          ? await signRobinhoodMessage(challenge.message, evmWalletProvider || undefined)
          : await signSolanaMessage(challenge.message, solWalletProvider || undefined);

      const response = await fetch("/api/registry/release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId: resolved.post.id,
          venue: reservedVenue,
          wallet,
          auth: {
            token: challenge.token,
            signature: proof.signature,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not release the failed reservation.");
      }

      setResolved((current) => current ? { ...current, registry: null } : current);
      setVenue(reservedVenue);
      setStatus("Reservation released. Review the launch settings and try again.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not release reservation.");
    } finally {
      setLaunching(false);
    }
  }

  async function reserveLaunch(wallet: string) {
    if (!resolved) throw new Error("Resolve an X post first.");

    setStatus("Sign the reservation message to prove wallet ownership…");
    const challengeResponse = await fetch("/api/auth/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postId: resolved.post.id,
        venue,
        wallet,
      }),
    });
    const challenge = await challengeResponse.json();
    if (!challengeResponse.ok) {
      throw new Error(
        challenge.error || "Could not create wallet reservation challenge.",
      );
    }

    const proof =
      venue === "pons"
        ? await signRobinhoodMessage(challenge.message, evmWalletProvider || undefined)
        : await signSolanaMessage(challenge.message, solWalletProvider || undefined);

    const sameWallet =
      venue === "pons"
        ? proof.wallet.toLowerCase() === wallet.toLowerCase()
        : proof.wallet === wallet;
    if (!sameWallet) {
      throw new Error(
        "The wallet that signed the reservation changed. Reconnect and try again.",
      );
    }

    const launchConfig =
      venue === "stonkfun"
        ? { quoteMint: stonkPair, mode: stonkMode, rewardBps, openingBuy: stonkDevBuy }
        : venue === "pumpfun"
          ? {
              quoteMint: pumpQuote,
              quoteSource: selectedPumpQuote?.source || "",
              mayhemMode: pumpMayhem,
              holderReward: pumpHolderReward,
              creatorFeeBps: pumpCreatorFeeBps,
            }
          : {
              pairToken: ponsPair,
              launchConfigId: ponsConfig,
              creatorTaxBps: creatorTax,
              buybackEnabled: buyback,
              openingBuy: devBuy,
              openingBuyRecipient: buyRecipient,
              openingBuySlippageBps: 300,
              exemptions,
              salt,
            };

    const response = await fetch("/api/registry/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postId: resolved.post.id,
        postUrl: sourceX,
        venue,
        wallet,
        name,
        symbol,
        description,
        image,
        website,
        telegram,
        discord,
        farcaster,
        feeRoute,
        customFeeWallet,
        charityId: feeRoute === "charity" ? selectedCharity?.id || "" : "",
        authorHandle: resolved.post.handle,
        stonkMode,
        pumpHolderReward,
        launchConfig,
        socialCommandId,
        auth: {
          token: challenge.token,
          signature: proof.signature,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not reserve this X post.");
    return data as {
      metadata: {
        name: string;
        symbol: string;
        description: string;
        image: string;
        socials: {
          twitter: string;
          telegram: string;
          discord: string;
          website: string;
          farcaster: string;
        };
      };
      feeDestination: {
        route: string;
        recipientHandle: string | null;
        recipientWallet: string | null;
      };
      releaseToken: string;
    };
  }

  async function confirmLaunch(result: {
    wallet: string;
    txHash: string;
    tokenAddress: string;
  }) {
    if (!resolved) throw new Error("Missing X post.");

    const response = await fetch(
      venue === "pons" ? "/api/registry/confirm" : "/api/registry/confirm-solana",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postId: resolved.post.id,
          wallet: result.wallet,
          txHash: result.txHash,
          tokenAddress: result.tokenAddress,
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data.error ||
          "The token launched, but XLaunch could not verify the canonical assignment.",
      );
    }
    return data;
  }

  async function retryPendingConfirmation() {
    if (!pendingLaunch) return;
    setLaunching(true);
    setStatus("Retrying canonical onchain verification…");
    try {
      await confirmLaunch(pendingLaunch);
      window.localStorage.removeItem(`xlaunch:pending:${pendingLaunch.postId}`);
      setPendingLaunch(null);
      setStatus("Launch verified. This X post is now permanently assigned in XLaunch.");
      window.location.href = `/post/${pendingLaunch.postId}`;
    } catch (error) {
      setStatus(
        `The token exists onchain, but XLaunch verification is still pending: ${
          error instanceof Error ? error.message : "Confirmation failed."
        }`,
      );
    } finally {
      setLaunching(false);
    }
  }

  async function launch() {
    if (!resolved) return;
    if (!resolved.registryConfigured) {
      setStatus("Canonical registry database is not connected yet.");
      return;
    }
    if (alreadyLive) {
      window.location.href = `/post/${resolved.post.id}`;
      return;
    }
    if (!name.trim() || !symbol.trim()) {
      setStatus("Token name and ticker are required.");
      return;
    }
    if (uploadingImage) {
      setStatus("Wait for the token image upload to finish.");
      return;
    }
    if (feeRoute === "charity" && venue === "pumpfun" && !selectedCharity) {
      setStatus("Select a Donate.gg charity before launching.");
      return;
    }

    setLaunching(true);
    let reservationReleaseToken = "";
    let reservationWallet = "";
    let onchainResult: { wallet: string; txHash: string; tokenAddress: string } | null = null;
    try {
      let wallet = activeWallet;
      if (!wallet) {
        if (venue === "pons") {
          if (!evmWalletProvider) {
            throw new Error("Choose an EVM wallet before launching.");
          }
          wallet = await connectRobinhoodWallet(evmWalletProvider);
          setEvmWallet(wallet);
        } else {
          if (!solWalletProvider) {
            throw new Error("Choose a Solana wallet before launching.");
          }
          const account = await connectSolanaWallet(solWalletProvider);
          wallet = account.toBase58();
          setSolWallet(wallet);
        }
      }

      setStatus("Reserving this X post across all XLaunch venues…");
      const reservation = await reserveLaunch(wallet);
      reservationReleaseToken = reservation.releaseToken;
      reservationWallet = wallet;
      setStatus(
        `Reserved. Review and sign the ${venue === "pons" ? "Robinhood Chain" : "Solana"} transaction in your wallet…`,
      );

      let result: { wallet: string; txHash: string; tokenAddress: string };

      if (venue === "pons") {
        const config = pons?.configs.find(
          (item) => item.id === ponsConfig && item.enabled,
        );
        if (!config) {
          throw new Error("The selected Pons launch configuration is no longer enabled.");
        }

        result = await launchOnPons({
          metadata: reservation.metadata,
          launchConfig: config,
          pairToken: ponsPair,
          creatorTaxBps: creatorTax,
          buybackEnabled: buyback,
          creatorFeeRecipient: reservation.feeDestination.recipientWallet || wallet,
          openingBuy: devBuy,
          openingBuyRecipient: buyRecipient,
          exemptions,
          salt,
          walletProvider: evmWalletProvider || undefined,
        });
      } else if (venue === "pumpfun") {
        if (!selectedPumpQuote) throw new Error("Select a live Pump.fun quote asset.");
        result = await launchOnPump({
          postId: resolved.post.id,
          metadata: {
            name: reservation.metadata.name,
            symbol: reservation.metadata.symbol,
          },
          quoteMint: pumpQuote,
          quoteSource: selectedPumpQuote.source,
          openingBuy: pumpOpeningBuy,
          mayhemMode: pumpMayhem,
          holderReward: pumpHolderReward,
          creatorFeeBps:
            selectedPumpQuote.source === "quoteControl" ? pumpCreatorFeeBps : 0,
          feeRecipientWallet: reservation.feeDestination.recipientWallet,
          walletProvider: solWalletProvider || undefined,
        });
      } else {
        if (!selectedPair?.mint) throw new Error("Select a live StonkFun pair.");
        result = await launchOnStonkFun({
          postId: resolved.post.id,
          name: reservation.metadata.name,
          symbol: reservation.metadata.symbol,
          quoteMint: stonkPair,
          quoteTokenProgram: selectedPair.tokenProgram,
          mode: stonkMode,
          rewardBps,
          feeRecipientWallet: reservation.feeDestination.recipientWallet,
          openingBuy: stonkDevBuy,
          walletProvider: solWalletProvider || undefined,
        });
      }

      onchainResult = result;
      const recoveryRecord = {
        ...result,
        postId: resolved.post.id,
        venue,
      };
      setPendingLaunch(recoveryRecord);
      window.localStorage.setItem(
        `xlaunch:pending:${resolved.post.id}`,
        JSON.stringify(recoveryRecord),
      );

      setStatus("Onchain transaction confirmed. Verifying the canonical assignment…");
      await confirmLaunch(result);
      window.localStorage.removeItem(`xlaunch:pending:${resolved.post.id}`);
      setPendingLaunch(null);

      if (socialCommandId) {
        const socialResponse = await fetch("/api/social/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            commandPostId: socialCommandId,
            postId: resolved.post.id,
            tokenAddress: result.tokenAddress,
            txHash: result.txHash,
          }),
        });
        if (!socialResponse.ok) {
          const socialBody = await socialResponse.json().catch(() => ({}));
          throw new Error(
            socialBody.error ||
              "Token launched, but the X command could not be marked complete.",
          );
        }
      }

      setStatus("Launch verified. This X post is now permanently assigned in XLaunch.");
      window.location.href = `/post/${resolved.post.id}`;
    } catch (error) {
      const mayHaveBroadcast = Boolean(
        (error as Error & { launchBroadcasted?: boolean })?.launchBroadcasted,
      );

      if (
        reservationReleaseToken &&
        reservationWallet &&
        !onchainResult &&
        !mayHaveBroadcast &&
        resolved
      ) {
        try {
          const releaseResponse = await fetch("/api/registry/release", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              postId: resolved.post.id,
              venue,
              wallet: reservationWallet,
              releaseToken: reservationReleaseToken,
            }),
          });
          if (releaseResponse.ok) {
            setResolved((current) => current ? { ...current, registry: null } : current);
            setStatus(
              `${error instanceof Error ? error.message : "Launch failed."} Reservation released automatically; you can retry immediately.`,
            );
          } else {
            setStatus(error instanceof Error ? error.message : "Launch failed.");
          }
        } catch {
          setStatus(error instanceof Error ? error.message : "Launch failed.");
        }
      } else {
        setStatus(
          mayHaveBroadcast && !onchainResult
            ? `${error instanceof Error ? error.message : "Launch status uncertain."} The reservation is being kept temporarily because the transaction may have been broadcast.`
            : error instanceof Error ? error.message : "Launch failed.",
        );
      }
    } finally {
      setLaunching(false);
    }
  }

  return (
    <main className={resolved ? "xlaunchPage is-resolved" : "xlaunchPage is-idle"}>
      <div className="xlGrain" aria-hidden="true" />
      <button
        className={menuOpen ? "xlMenuBackdrop is-open" : "xlMenuBackdrop"}
        type="button"
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />

      <header className="xlHeader">
        <a className="xlLogo xlAppear xlScale" href="#launch" aria-label="XLaunch home">
          <span className="xlLogoMark" aria-hidden="true">
            <XBrandMark />
          </span>
          <span>XLaunch</span>
        </a>

        <nav className={menuOpen ? "xlNav is-open" : "xlNav"} aria-label="Primary">
          <a className="xlNavPill xlAppear xlScale" href="#launch" onClick={() => setMenuOpen(false)}>
            Launch
          </a>
          <a className="xlNavPill xlAppear xlSoft" href="/explore" onClick={() => setMenuOpen(false)}>
            Explore
          </a>
          <a className="xlNavPill xlAppear xlScale" href="/profile" onClick={() => setMenuOpen(false)}>
            Profile
          </a>
          <a
            className="xlNavPill xlAppear xlSoft"
            href="https://x.com/launchonx_"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            @launchonx_
          </a>
        </nav>

        <div className="xlHeaderActions">
          {venue === "pons" ? (
            <select
              className="xlWalletSelect"
              aria-label="Choose EVM wallet"
              value={evmWalletProvider}
              onFocus={() => setEvmWalletOptions(availableEvmWallets())}
              onChange={(event) => {
                setEvmWalletProvider(event.target.value as EvmWalletChoice | "");
                setEvmWallet("");
                setStatus("");
              }}
            >
              <option value="">Choose wallet</option>
              {evmWalletOptions.map((walletOption) => (
                <option key={walletOption.id} value={walletOption.id}>
                  {walletOption.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="xlWalletSelect"
              aria-label="Choose Solana wallet"
              value={solWalletProvider}
              onFocus={() => setSolWalletOptions(availableSolanaWallets())}
              onChange={(event) => {
                setSolWalletProvider(event.target.value as SolanaWalletChoice | "");
                setSolWallet("");
                setStatus("");
              }}
            >
              <option value="">Choose wallet</option>
              {solWalletOptions.map((walletOption) => (
                <option key={walletOption.id} value={walletOption.id}>
                  {walletOption.label}
                </option>
              ))}
            </select>
          )}
          <button className="xlButton xlButtonSolid xlAppear xlScale" type="button" onClick={connectCurrentWallet}>
            {activeWallet
              ? activeWallet.slice(0, 5) + "…" + activeWallet.slice(-4)
              : "Connect Wallet"}
          </button>
          <button
            className={menuOpen ? "xlBurger is-open" : "xlBurger"}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span/><span/><span/>
          </button>
        </div>
      </header>

      <section className="xlHero" id="launch">
        <div className="xlHeroCopy">
          <div className="xlBadge xlAppear xlPop">
            <span className="xlSpark" aria-hidden="true">✦</span>
            End PvP tokens
          </div>

          <h1>
            <span className="xlHeadlineLine xlAppear xlMask">Turn any X post into</span>
            <span className="xlHeadlineLine xlAppear xlMask">one <em>canonical token.</em></span>
          </h1>

          <p className="xlLede xlAppear xlSoft">
            One post. One token. One chain. Forever. Launch through Pump.fun, StonkFun,
            or Pons while your wallet keeps control.
          </p>

          <div className="xlPaste xlAppear xlButtonIn">
            <span className="xlXMark"><XBrandMark /></span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Paste an X post link"
              aria-label="X post URL"
              onKeyDown={(event) => event.key === "Enter" && void resolvePost()}
            />
            <button type="button" onClick={() => void resolvePost()} disabled={loading}>
              {loading ? "Checking…" : "Tokenize →"}
            </button>
          </div>

          {resolveError && <div className="error">{resolveError}</div>}
          <div className="xlHeroFine xlAppear xlSoft">
            The first confirmed XLaunch assignment becomes that post&apos;s canonical XLaunch token.
          </div>
        </div>
      </section>

      <div className="xlStats" aria-label="XLaunch capabilities">
        <div className="xlStat xlAppear xlStatIn">
          <span className="xlStatIcon">◎</span>
          <span>Pump.fun · StonkFun · Pons</span>
        </div>
        <div className="xlStat xlAppear xlStatIn">
          <span className="xlStatIcon">1</span>
          <span>One canonical token per X post</span>
        </div>
        <div className="xlStat xlAppear xlStatIn">
          <span className="xlStatIcon"><XBrandMark /></span>
          <span>Launch directly with @launchonx_</span>
        </div>
      </div>

      {resolved && (
        <section className="builder" id="launch-builder">
          <aside className="sourceColumn">
            <div className="sectionLabel">01 / SOURCE</div>

            <div className="postCard">
              <div className="postHead">
                <div className="avatar"><XBrandMark /></div>
                <div>
                  <b>{resolved.post.authorName || "X user"}</b>
                  <span>@{resolved.post.handle || "unknown"}</span>
                </div>
                <div className="xMark"><XBrandMark /></div>
              </div>

              <p>{resolved.post.text || "Post content remains tied to its immutable X status id."}</p>
              <a href={sourceX} target="_blank" rel="noreferrer">VIEW ORIGINAL ↗</a>
            </div>

            <div className="sourceStatus">
              <span>POST ID</span>
              <code>{resolved.post.id}</code>
              <span>REGISTRY</span>
              <b className={alreadyLive || reserved ? "taken" : "available"}>
                {alreadyLive ? "TOKENIZED" : reserved ? "RESERVED" : "AVAILABLE"}
              </b>
            </div>

            {alreadyLive && (
              <div className="already">
                <small>THIS POST IS ALREADY ONCHAIN</small>
                <strong>{resolved.registry?.venue.toUpperCase()}</strong>
                <span>{resolved.registry?.token_address}</span>
              </div>
            )}

            {reserved && !pendingLaunch && (
              <div className="reservationRecovery">
                <small>FAILED OR ABANDONED LAUNCH?</small>
                <b>THIS POST IS TEMPORARILY RESERVED</b>
                <p>
                  If your wallet shows no successful launch transaction, connect the
                  same wallet and release this reservation before retrying.
                </p>
                <button
                  type="button"
                  disabled={launching}
                  onClick={() => void releaseReservationForRetry()}
                >
                  {launching ? "CHECKING…" : "RELEASE RESERVATION & RETRY"}
                </button>
              </div>
            )}
          </aside>

          <div className="formColumn">
            <div className="sectionLabel">02 / TOKEN</div>

            <div className="grid two">
              <label>
                <span>NAME</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>TICKER</span>
                <div className="ticker">
                  <i>$</i>
                  <input
                    value={symbol}
                    onChange={(event) =>
                      setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))
                    }
                  />
                </div>
              </label>
            </div>

            <label>
              <span>DESCRIPTION</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
            </label>

            <div className="tokenImageField">
              <span className="tokenImageLabel">IMAGE / LOGO</span>

              <div className="tokenImageTabs" role="tablist" aria-label="Token image source">
                <button
                  type="button"
                  className={imageMode === "upload" ? "active" : ""}
                  onClick={() => {
                    setImageMode("upload");
                    setImageError("");
                    setImage(image && uploadedImagePreview ? image : "");
                  }}
                >
                  UPLOAD
                </button>
                <button
                  type="button"
                  className={imageMode === "post" ? "active" : ""}
                  disabled={!resolved.post.media?.length}
                  onClick={() => {
                    const first = resolved.post.media?.[0]?.url || "";
                    setImageMode("post");
                    setImage(first);
                    setImageError("");
                  }}
                >
                  POST MEDIA
                </button>
                <button
                  type="button"
                  className={imageMode === "url" ? "active" : ""}
                  onClick={() => {
                    setImageMode("url");
                    setImage(manualImageUrl.trim());
                    setImageError("");
                  }}
                >
                  IMAGE URL
                </button>
              </div>

              {imageMode === "upload" && (
                <div className="tokenUploadPanel">
                  <input
                    ref={fileInputRef}
                    className="tokenImageInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/*"
                    onChange={onImageInput}
                  />
                  <div
                    className={draggingImage ? "tokenDropzone is-dragging" : "tokenDropzone"}
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDraggingImage(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDraggingImage(false)}
                    onDrop={onImageDrop}
                  >
                    {uploadedImagePreview ? (
                      <img src={uploadedImagePreview} alt="Token image preview" />
                    ) : (
                      <div className="tokenDropIcon">+</div>
                    )}
                    <div>
                      <b>{uploadingImage ? "UPLOADING…" : "DROP A TOKEN IMAGE HERE"}</b>
                      <span>or click to choose from your device</span>
                      <small>PNG · JPG · WEBP · automatically center-cropped to 1:1</small>
                    </div>
                  </div>
                  <div className="tokenUploadFooter">
                    <small>
                      {image
                        ? "Uploaded · 512 × 512 · ready for launch"
                        : "Optional. If blank, XLaunch uses the canonical post card."}
                    </small>
                    {uploadedImagePreview && (
                      <button
                        type="button"
                        onClick={() => {
                          if (uploadedImagePreview.startsWith("blob:")) {
                            URL.revokeObjectURL(uploadedImagePreview);
                          }
                          setUploadedImagePreview("");
                          setImage("");
                          setImageError("");
                        }}
                      >
                        REMOVE
                      </button>
                    )}
                  </div>
                </div>
              )}

              {imageMode === "post" && (
                <div className="postMediaPicker">
                  {resolved.post.media?.length ? (
                    resolved.post.media.map((media, index) => (
                      <button
                        type="button"
                        key={media.url}
                        className={image === media.url ? "selected" : ""}
                        onClick={() => selectPostMedia(media.url)}
                      >
                        <img src={media.url} alt={`Post media ${index + 1}`} />
                        <span>{image === media.url ? "SELECTED" : `MEDIA ${index + 1}`}</span>
                      </button>
                    ))
                  ) : (
                    <div className="tokenImageEmpty">No image media was detected on this X post.</div>
                  )}
                </div>
              )}

              {imageMode === "url" && (
                <div className="tokenImageUrl">
                  <input
                    value={manualImageUrl}
                    onChange={(event) => {
                      setManualImageUrl(event.target.value);
                      setImage(event.target.value.trim());
                    }}
                    placeholder="https://…/token-image.png"
                    inputMode="url"
                  />
                  {manualImageUrl.trim() && (
                    <div className="tokenUrlPreview">
                      <img src={manualImageUrl.trim()} alt="Token image URL preview" />
                    </div>
                  )}
                </div>
              )}

              {imageError && <div className="tokenImageError">{imageError}</div>}
            </div>

            <div className="lockedSocial">
              <div>
                <span>TWITTER / X</span>
                <b>LOCKED TO SOURCE POST</b>
              </div>
              <code>{sourceX}</code>
              <small>This cannot be replaced with another X account or post.</small>
            </div>

            <div className="sectionLabel venueLabel">03 / LAUNCH VENUE</div>

            <div className="venueCards">
              <button
                type="button"
                className={venue === "stonkfun" ? "active" : ""}
                onClick={() => setVenue("stonkfun")}
              >
                <span>STONKFUN</span>
                <small>SOLANA</small>
                <i>{stonkPairs.length ? `${stonkPairs.length} LIVE PAIRS` : "LIVE CAPABILITIES"}</i>
              </button>

              <button
                type="button"
                className={venue === "pons" ? "active" : ""}
                onClick={() => setVenue("pons")}
              >
                <span>PONS V2</span>
                <small>ROBINHOOD CHAIN</small>
                <i>{pons?.launchEnabled ? "LAUNCHING OPEN" : "CHECKING CHAIN"}</i>
              </button>

              <button
                type="button"
                className={venue === "pumpfun" ? "active" : ""}
                onClick={() => setVenue("pumpfun")}
              >
                <span>PUMP.FUN</span>
                <small>SOLANA</small>
                <i>{pump?.quotes?.length ? `${pump.quotes.length} LIVE PAIRS` : "CHECKING CHAIN"}</i>
              </button>
            </div>

            {venue === "stonkfun" ? (
              <div className="venueForm">
                <div className="grid two">
                  <label>
                    <span>PAIR</span>
                    <select value={stonkPair} onChange={(event) => setStonkPair(event.target.value)}>
                      {stonkPairs.map((pair, index) => (
                        <option key={pair.mint || index} value={pair.mint}>
                          {pair.symbol || pair.name || pair.mint}
                        </option>
                      ))}
                    </select>
                    <small>
                      {selectedPair?.category ? `Category: ${selectedPair.category}` : "Loaded live from StonkFun."}
                    </small>
                  </label>

                  <label>
                    <span>MODE</span>
                    <select
                      value={stonkMode}
                      onChange={(event) => setStonkMode(event.target.value as "standard" | "reward")}
                    >
                      <option value="standard">Standard</option>
                      <option value="reward">Reward</option>
                    </select>
                  </label>
                </div>

                {stonkMode === "reward" && (
                  <label>
                    <span>HOLDER REWARD TRANSFER FEE</span>
                    <select value={rewardBps} onChange={(event) => setRewardBps(Number(event.target.value))}>
                      {rewardTiers.map((bps) => (
                        <option key={bps} value={bps}>{(bps / 100).toFixed(2)}%</option>
                      ))}
                    </select>
                    <small>Only reward tiers currently published by StonkFun are available.</small>
                  </label>
                )}

                <label>
                  <span>OPENING / DEV BUY</span>
                  <input
                    value={stonkDevBuy}
                    onChange={(event) => setStonkDevBuy(event.target.value)}
                    inputMode="decimal"
                  />
                  <small>Quoted in the selected pair asset.</small>
                </label>

                {stonkPricing && (
                  <div className="liveRead">
                    <span>LIVE CURVE TERMS</span>
                    <code>{stonkPricing?.curve?.configId ? "SYNCED" : "LOADED"}</code>
                  </div>
                )}
              </div>
            ) : venue === "pons" ? (
              <div className="venueForm">
                <div className="grid two">
                  <label>
                    <span>LAUNCH CONFIG</span>
                    <select value={ponsConfig} onChange={(event) => setPonsConfig(Number(event.target.value))}>
                      {(pons?.configs || [])
                        .filter((config) => config.enabled)
                        .map((config) => (
                          <option key={config.id} value={config.id}>
                            Config {config.id} · {config.curveFeeBps / 100}% curve fee
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    <span>CREATOR TAX</span>
                    <input
                      type="number"
                      min="0"
                      max={(pons?.maxCreatorTaxBps || 0) / 100}
                      step=".01"
                      value={creatorTax / 100}
                      onChange={(event) => setCreatorTax(Math.round(Number(event.target.value) * 100))}
                    />
                    <small>Live protocol cap: {(pons?.maxCreatorTaxBps || 0) / 100}%</small>
                  </label>
                </div>

                <label>
                  <span>PAIR TOKEN</span>
                  <div className="inline">
                    <input
                      value={ponsPair}
                      onChange={(event) => setPonsPair(event.target.value)}
                      placeholder="ETH or any approved token address"
                    />
                    <button type="button" onClick={validatePonsPair}>VERIFY</button>
                  </div>
                  <small>
                    Any Pons-approved pair is allowed. XLaunch checks the current factory instead of using a closed list.
                  </small>
                  {ponsPairState?.approved && (
                    <b className="valid">
                      ✓ {ponsPairState.symbol} APPROVED
                      {ponsPairState.graduationThreshold ? ` · GRADUATES AT ${ponsPairState.graduationThreshold}` : ""}
                    </b>
                  )}
                  {ponsPairState?.error && <b className="invalid">{ponsPairState.error}</b>}
                </label>

                <div className="grid two">
                  <label>
                    <span>OPENING / DEV BUY</span>
                    <input value={devBuy} onChange={(event) => setDevBuy(event.target.value)} inputMode="decimal" />
                  </label>

                  <label className="check">
                    <input type="checkbox" checked={buyback} onChange={(event) => setBuyback(event.target.checked)} />
                    <span>ENABLE BUYBACKS</span>
                  </label>
                </div>

                <div className="liveRead">
                  <span>LIVE PONS LAUNCH FEE</span>
                  <code>{pons?.launchFeeEth || "—"} ETH</code>
                </div>
              </div>
            ) : (
              <div className="venueForm">
                <div className="grid two">
                  <label>
                    <span>PAIR</span>
                    <select value={pumpQuote} onChange={(event) => setPumpQuote(event.target.value)}>
                      {(pump?.quotes || []).map((quote) => (
                        <option key={quote.mint} value={quote.mint}>
                          {quote.symbol || `${quote.mint.slice(0, 6)}…`} · {quote.source}
                        </option>
                      ))}
                    </select>
                    <small>Loaded from Pump.fun&apos;s current onchain supported quote set.</small>
                  </label>

                  <label>
                    <span>OPENING / DEV BUY</span>
                    <input
                      value={pumpOpeningBuy}
                      onChange={(event) => setPumpOpeningBuy(event.target.value)}
                      inputMode="decimal"
                    />
                    <small>Quoted in the selected Pump.fun pair asset.</small>
                  </label>
                </div>

                <div className="grid two">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pumpMayhem}
                      onChange={(event) => setPumpMayhem(event.target.checked)}
                    />
                    <span>MAYHEM MODE</span>
                  </label>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pumpHolderReward}
                      disabled={!pump?.holderRewardsEnabled}
                      onChange={(event) => setPumpHolderReward(event.target.checked)}
                    />
                    <span>HOLDER REWARDS</span>
                  </label>
                </div>

                <label>
                  <span>CUSTOM CREATOR FEE BPS</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={selectedPumpQuote?.source !== "quoteControl"}
                    value={selectedPumpQuote?.source === "quoteControl" ? pumpCreatorFeeBps : 0}
                    onChange={(event) => setPumpCreatorFeeBps(Math.max(0, Number(event.target.value) || 0))}
                  />
                  <small>
                    Used only where Pump.fun&apos;s current quote/config permits a custom creator fee.
                    SOL and USDC use Pump.fun&apos;s standard schedule.
                  </small>
                </label>

                <div className="liveRead">
                  <span>PUMP.FUN OPTIONS</span>
                  <code>
                    {pump?.holderRewardsEnabled ? "HOLDER REWARDS LIVE" : "HOLDER REWARDS PAUSED"}
                  </code>
                </div>
              </div>
            )}

            <div className="sectionLabel venueLabel">04 / CREATOR FEES</div>
            {(venue === "stonkfun" && stonkMode === "reward") || (venue === "pumpfun" && pumpHolderReward) ? (
              <div className="lockedSocial">
                <div>
                  <span>FEE DESTINATION</span>
                  <b>HOLDER REWARDS</b>
                </div>
                <small>
                  This launch mode routes creator/reward fees to holders, so there is no developer,
                  custom-wallet, or X Money creator-fee destination.
                </small>
              </div>
            ) : (
              <div className="venueForm">
                <label>
                  <span>WHERE SHOULD CREATOR FEES GO?</span>
                  <select
                    value={feeRoute}
                    onChange={(event) =>
                      setFeeRoute(
                        event.target.value as
                          | "author_xmoney"
                          | "developer"
                          | "custom"
                          | "charity",
                      )
                    }
                  >
                    <option
                      value="author_xmoney"
                      disabled={
                        venue === "pons"
                          ? !features.xMoney.robinhood
                          : !features.xMoney.solana
                      }
                    >
                      Original X author via X Money · @{resolved.post.handle || "author"}
                      {(venue === "pons"
                        ? !features.xMoney.robinhood
                        : !features.xMoney.solana)
                        ? " · SETUP PENDING"
                        : ""}
                    </option>
                    <option value="developer">Developer · connected wallet</option>
                    <option value="custom">Custom wallet</option>
                    {venue === "pumpfun" && (
                      <option
                        value="charity"
                        disabled={!features.charity.pumpfun}
                      >
                        Charity · Donate.gg
                        {!features.charity.pumpfun ? " · SETUP PENDING" : ""}
                      </option>
                    )}
                  </select>
                  <small>
                    X Money routing is publicly tracked on the token page. XLaunch never represents
                    itself as affiliated with X or X Money.
                  </small>
                </label>

                {feeRoute === "charity" && venue === "pumpfun" && (
                  <div className="charityPicker">
                    <label>
                      <span>DONATE.GG CHARITY</span>
                      <div className="inline">
                        <input
                          value={charityQuery}
                          onChange={(event) => setCharityQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              searchCharities();
                            }
                          }}
                          placeholder="Search participating charities"
                        />
                        <button
                          type="button"
                          onClick={searchCharities}
                          disabled={charitySearching}
                        >
                          {charitySearching ? "SEARCHING…" : "SEARCH"}
                        </button>
                      </div>
                      <small>
                        Results come live from Donate.gg. The selected charity is recorded
                        publicly with this token&apos;s provenance.
                      </small>
                    </label>

                    {charities.length > 0 && (
                      <div className="charityResults">
                        {charities.map((charity) => (
                          <button
                            type="button"
                            key={charity.id}
                            className={selectedCharity?.id === charity.id ? "selected" : ""}
                            onClick={() => setSelectedCharity(charity)}
                          >
                            <b>{charity.name}</b>
                            <span>
                              {charity.country} · {charity.status.replaceAll("_", " ")}
                            </span>
                            <small>{charity.mission?.slice(0, 150)}</small>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedCharity && (
                      <div className="charitySelected">
                        <span>SELECTED CHARITY</span>
                        <b>{selectedCharity.name}</b>
                        <small>
                          Creator fees route through XLaunch&apos;s Donate.gg settlement
                          flow and a Donate.gg config created for this charity.
                        </small>
                      </div>
                    )}

                    {charityRoutingConfigured === false && (
                      <div className="invalid">
                        Charity discovery works, but live routing still needs XLaunch&apos;s
                        Donate.gg developer key and settlement treasury.
                      </div>
                    )}
                  </div>
                )}

                {feeRoute === "custom" && (
                  <label>
                    <span>CUSTOM FEE WALLET</span>
                    <input
                      value={customFeeWallet}
                      onChange={(event) => setCustomFeeWallet(event.target.value)}
                      placeholder={venue === "pons" ? "0x…" : "Solana address"}
                    />
                  </label>
                )}

                {feeRoute === "author_xmoney" && (
                  <div className="liveRead">
                    <span>PUBLIC PAYOUT RECIPIENT</span>
                    <code>@{resolved.post.handle || "author"} · X MONEY</code>
                  </div>
                )}
              </div>
            )}

            <button className="advancedToggle" type="button" onClick={() => setAdvanced((value) => !value)}>
              {advanced ? "−" : "+"} ADVANCED / ALL VENUE OPTIONS
            </button>

            {advanced && (
              <div className="advanced">
                <div className="grid two">
                  <label>
                    <span>WEBSITE</span>
                    <input
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      placeholder="https://launchonx.net"
                    />
                    <small>Optional. Blank defaults permanently to https://launchonx.net.</small>
                  </label>

                  <label>
                    <span>TELEGRAM</span>
                    <input value={telegram} onChange={(event) => setTelegram(event.target.value)} />
                  </label>

                  <label>
                    <span>DISCORD</span>
                    <input value={discord} onChange={(event) => setDiscord(event.target.value)} />
                  </label>

                  <label>
                    <span>FARCASTER</span>
                    <input value={farcaster} onChange={(event) => setFarcaster(event.target.value)} />
                  </label>
                </div>

                {venue === "pons" && (
                  <>
                    <label>
                      <span>OPENING BUY RECIPIENT</span>
                      <input
                        value={buyRecipient}
                        onChange={(event) => setBuyRecipient(event.target.value)}
                        placeholder="Connected wallet by default"
                      />
                    </label>

                    <label>
                      <span>EXTRA OPENING-TAX EXEMPT WALLETS</span>
                      <textarea
                        value={exemptions}
                        onChange={(event) => setExemptions(event.target.value)}
                        placeholder="One 0x address per line"
                        rows={3}
                      />
                      <small>Pons currently permits up to 32 extra exemption addresses.</small>
                    </label>

                    <label>
                      <span>CREATE2 SALT</span>
                      <input
                        value={salt}
                        onChange={(event) => setSalt(event.target.value)}
                        placeholder="Randomized if blank"
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            <div className="review">
              <div><span>X SOURCE</span><b>{sourceX}</b></div>
              <div><span>WEBSITE</span><b>{finalWebsite}</b></div>
              <div><span>CANONICAL REGISTRY</span><b>https://launchonx.net/post/{resolved.post.id}</b></div>
              <div>
                <span>DESTINATION</span>
                <b>
                  {venue === "pons"
                    ? "PONS · ROBINHOOD CHAIN"
                    : venue === "pumpfun"
                      ? "PUMP.FUN · SOLANA"
                      : "STONKFUN · SOLANA"}
                </b>
              </div>
            </div>

            {reserved && !pendingLaunch ? (
              <button
                className="launch reservationLaunch"
                type="button"
                disabled={launching}
                onClick={() => void releaseReservationForRetry()}
              >
                {launching ? "RELEASING…" : "RELEASE RESERVATION & RETRY →"}
              </button>
            ) : (
              <button
                className="launch"
                type="button"
                disabled={alreadyLive || launching}
                onClick={launch}
              >
                {alreadyLive
                  ? "POST ALREADY TOKENIZED"
                  : launching
                    ? "LAUNCHING…"
                    : "REVIEW & LAUNCH →"}
              </button>
            )}

            {pendingLaunch && (
              <div className="launchRecovery">
                <b>ONCHAIN LAUNCH FOUND</b>
                <div>
                  <span>CONTRACT ADDRESS</span>
                  <code>{pendingLaunch.tokenAddress}</code>
                </div>
                <div>
                  <span>TRANSACTION</span>
                  <code>{pendingLaunch.txHash}</code>
                </div>
                <div className="launchRecoveryActions">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(pendingLaunch.tokenAddress)}
                  >
                    COPY CA
                  </button>
                  <a
                    href={
                      pendingLaunch.venue === "pons"
                        ? `https://robinhoodchain.blockscout.com/tx/${pendingLaunch.txHash}`
                        : `https://solscan.io/tx/${pendingLaunch.txHash}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    VIEW TX ↗
                  </a>
                  <button
                    type="button"
                    disabled={launching}
                    onClick={() => void retryPendingConfirmation()}
                  >
                    {launching ? "VERIFYING…" : "RETRY XLAUNCH VERIFICATION"}
                  </button>
                </div>
                <small>
                  The token transaction succeeded. This panel remains until XLaunch
                  verifies and records the canonical assignment.
                </small>
              </div>
            )}
            {status && <div className="status">{status}</div>}
          </div>
        </section>
      )}

      <section className="manifesto">
        <div className="sectionLabel">WHY XLAUNCH</div>
        <div className="manifestoGrid">
          <h2>END<br />PVP<br />TOKENS.</h2>
          <div>
            <p>Every post has a story. Now every story can have one canonical XLaunch token.</p>
            <p>
              The first successful XLaunch assignment binds the X status ID to one token address, one venue
              and one chain. The source X link stays with the token forever.
            </p>
            <div className="rule">
              ONE POST <span>→</span> ONE TOKEN <span>→</span> ONE CHAIN <span>→</span> FOREVER
            </div>
          </div>
        </div>
      </section>

      <footer>
        <b>XLAUNCH</b>
        <span>XLAUNCH.IT</span>
        <span>NON-CUSTODIAL · CANONICAL PROVENANCE</span>
      </footer>
    </main>
  );
}
