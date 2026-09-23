import { afterEach, describe, expect, it } from "vitest";
import { resolveFeeDestination } from "../src/lib/fees";

const oldSol = process.env.XLAUNCH_XMONEY_SOL_TREASURY;
const oldEvm = process.env.XLAUNCH_XMONEY_EVM_TREASURY;
const oldDonate = process.env.XLAUNCH_DONATE_SOL_TREASURY;

afterEach(() => {
  process.env.XLAUNCH_XMONEY_SOL_TREASURY = oldSol;
  process.env.XLAUNCH_XMONEY_EVM_TREASURY = oldEvm;
  process.env.XLAUNCH_DONATE_SOL_TREASURY = oldDonate;
});

describe("creator fee routing", () => {
  it("routes Solana author fees to the settlement wallet and preserves the X handle", () => {
    process.env.XLAUNCH_XMONEY_SOL_TREASURY = "So11111111111111111111111111111111111111112";
    const route = resolveFeeDestination({
      venue: "pumpfun",
      route: "author_xmoney",
      developerWallet: "developer",
      authorHandle: "@alice",
    });
    expect(route.delivery).toBe("x_money");
    expect(route.recipientHandle).toBe("alice");
    expect(route.recipientWallet).toBe("So11111111111111111111111111111111111111112");
  });

  it("fails closed when X Money settlement infrastructure is missing", () => {
    delete process.env.XLAUNCH_XMONEY_EVM_TREASURY;
    expect(() =>
      resolveFeeDestination({
        venue: "pons",
        route: "author_xmoney",
        developerWallet: "0xdev",
        authorHandle: "alice",
      }),
    ).toThrow(/not configured/i);
  });

  it("forces StonkFun reward launches to holder rewards", () => {
    const route = resolveFeeDestination({
      venue: "stonkfun",
      stonkMode: "reward",
      route: "developer",
      developerWallet: "developer",
    });
    expect(route.route).toBe("holder_rewards");
    expect(route.recipientWallet).toBeNull();
  });

  it("routes Pump.fun charity fees to the Donate.gg settlement treasury", () => {
    process.env.XLAUNCH_DONATE_SOL_TREASURY =
      "So11111111111111111111111111111111111111112";
    const route = resolveFeeDestination({
      venue: "pumpfun",
      route: "charity",
      developerWallet: "developer",
    });
    expect(route.route).toBe("charity");
    expect(route.delivery).toBe("donate_gg");
    expect(route.recipientWallet).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });

  it("rejects Donate.gg routing on non-Pump venues", () => {
    expect(() =>
      resolveFeeDestination({
        venue: "pons",
        route: "charity",
        developerWallet: "developer",
      }),
    ).toThrow(/Pump\.fun/i);
  });

  it("keeps a custom wallet explicit", () => {
    const route = resolveFeeDestination({
      venue: "pumpfun",
      route: "custom",
      developerWallet: "developer",
      customWallet: "charity-wallet",
    });
    expect(route.route).toBe("custom");
    expect(route.recipientWallet).toBe("charity-wallet");
  });
});
