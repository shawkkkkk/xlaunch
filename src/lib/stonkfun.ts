const API = process.env.STONKFUN_API_BASE || "https://www.stonkfun.xyz/api/public/v1";

async function get(path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(API + path, {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body?.error?.message || `StonkFun request failed (${response.status})`,
      );
    }
    return body.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("StonkFun timed out. Try again shortly.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getStonkFunCapabilities() {
  const [stats, pairData] = await Promise.all([
    get("/stats"),
    get("/pairs?launchable=true&launchLabReady=true"),
  ]);
  const pairs = pairData.pairs ?? pairData;
  return {
    stats,
    pairs: Array.isArray(pairs) ? pairs : [],
  };
}

export async function getStonkFunPricing(quoteMint: string) {
  if (!quoteMint) throw new Error("quoteMint is required.");
  return get(`/launchlab/pricing?quoteMint=${encodeURIComponent(quoteMint)}`);
}
