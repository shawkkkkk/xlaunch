import { describe, expect, it } from "vitest";
import { buildLaunchMetadata } from "../src/lib/metadata";

describe("launch metadata", () => {
  it("uses XLaunch as the website when no website is supplied", () => {
    const result = buildLaunchMetadata({ postId: "123", name: "Hello", symbol: "hi" });
    expect(result.socials.website).toContain("/post/123");
  });

  it("preserves a valid custom website", () => {
    const result = buildLaunchMetadata({ postId: "123", name: "Hello", symbol: "$HI", website: "https://example.com" });
    expect(result.socials.website).toBe("https://example.com");
    expect(result.symbol).toBe("HI");
  });
});
