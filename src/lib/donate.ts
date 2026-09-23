import "server-only";

const BASE = "https://www.donate.gg/api/v1";

export type DonateCharity = {
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

function headers(requireKey = false) {
  const key = process.env.DONATE_GG_API_KEY?.trim();
  if (requireKey && !key) {
    throw new Error(
      "Donate.gg charity routing is not configured yet. XLaunch needs a Donate.gg developer API key.",
    );
  }
  return key ? { "donate-api-key": key } : {};
}

async function donateFetch(path: string, init?: RequestInit, requireKey = false) {
  const response = await fetch(BASE + path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...headers(requireKey),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.error ||
      body?.message ||
      `Donate.gg request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

export async function searchDonateCharities(term: string, limit = 12) {
  const value = term.trim();
  if (!value) return [];
  const params = new URLSearchParams({
    term: value.slice(0, 200),
    limit: String(Math.max(1, Math.min(limit, 20))),
  });
  const body = await donateFetch(`/charities/search?${params}`);
  const charities = Array.isArray(body?.response) ? body.response : [];
  return charities.filter(
    (item: DonateCharity) =>
      item?.id &&
      item?.name &&
      item.isEnabled !== false &&
      !["PLATFORM_DISABLED", "OPTED_OUT", "SOFT_HIDDEN"].includes(item.status),
  ) as DonateCharity[];
}

export async function getDonateCharity(charityId: string) {
  const id = charityId.trim();
  if (!id) throw new Error("Select a Donate.gg charity.");
  const body = await donateFetch(`/charities/${encodeURIComponent(id)}`);
  if (!body?.id || !body?.name) throw new Error("Donate.gg charity was not found.");
  if (
    body.isEnabled === false ||
    ["PLATFORM_DISABLED", "OPTED_OUT", "SOFT_HIDDEN"].includes(body.status)
  ) {
    throw new Error("That Donate.gg charity is not currently available.");
  }
  return body as DonateCharity;
}

export async function createDonateCharityConfig(charityId: string) {
  const charity = await getDonateCharity(charityId);
  const config = await donateFetch(
    "/configs",
    {
      method: "POST",
      body: JSON.stringify({
        charityBeneficiaries: [{ charityId: charity.id, weight: 10000 }],
      }),
    },
    true,
  );

  if (!config?.id?.base58 || !config?.id?.hex) {
    throw new Error("Donate.gg returned an invalid donation config.");
  }

  return {
    charity,
    configId: {
      base58: String(config.id.base58),
      hex: String(config.id.hex),
    },
    feeBps: String(config.feeBps ?? ""),
  };
}

export function donateRoutingConfigured() {
  return Boolean(
    process.env.DONATE_GG_API_KEY?.trim() &&
      process.env.XLAUNCH_DONATE_SOL_TREASURY?.trim(),
  );
}
