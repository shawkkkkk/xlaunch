const API = process.env.STONKFUN_API_BASE || "https://www.stonkfun.xyz/api/public/v1";

async function get(path: string) {
  const response = await fetch(API + path, { next: { revalidate: 30 } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `StonkFun request failed (${response.status})`);
  return body.data;
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
