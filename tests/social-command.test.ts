import { describe, expect, it } from "vitest";
import { parseSocialLaunchCommand } from "../src/lib/social-command";

describe("X social launch commands", () => {
  it("parses Pump.fun launch shorthand", () => {
    expect(parseSocialLaunchCommand("@xlaunch launch this on pumpfun as $DOG")).toMatchObject({
      venue: "pumpfun",
      symbol: "DOG",
    });
  });

  it("parses StonkFun reward mode", () => {
    expect(parseSocialLaunchCommand("@xlaunch launch this on stonkfun reward mode 2% as $POST")).toMatchObject({
      venue: "stonkfun",
      symbol: "POST",
      stonkMode: "reward",
      rewardPercent: 2,
    });
  });

  it("parses Pons pair and author fee routing", () => {
    expect(parseSocialLaunchCommand("@xlaunch launch this on pons paired with AAPL, fees to author")).toMatchObject({
      venue: "pons",
      pair: "AAPL",
      feeRoute: "author_xmoney",
    });
  });

  it("requires a venue so social launches are never ambiguous", () => {
    expect(() => parseSocialLaunchCommand("@xlaunch launch this as $POST")).toThrow(/Choose a venue/);
  });
});
