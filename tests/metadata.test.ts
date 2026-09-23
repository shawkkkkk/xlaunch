import { describe, expect, it } from "vitest";
import { buildLaunchMetadata, canonicalPostPage } from "../src/lib/metadata";

describe("launch metadata", () => {
  it("defaults website to the canonical XLaunch token page", () => {
    const result = buildLaunchMetadata({ postId: "123", name: "Hello", symbol: "hi" });
    expect(result.socials.website).toBe("https://launchonx.net/post/123");
    expect(result.source.registry).toBe(canonicalPostPage("123"));
    expect(result.source.registry).toBe("https://launchonx.net/post/123");
  });

  it("generates an XLaunch post card when no token image is supplied", () => {
    const result = buildLaunchMetadata({
      postId: "123",
      name: "Hello",
      symbol: "HI",
    });
    expect(result.image).toBe("https://launchonx.net/api/post-card/123");
  });

  it("always points twitter to the source post", () => {
    const result = buildLaunchMetadata({
      postId: "123",
      postUrl: "https://twitter.com/alice/status/123?s=20",
      name: "Hello",
      symbol: "HI",
    });
    expect(result.socials.twitter).toBe("https://x.com/alice/status/123");
  });

  it("preserves a valid custom website", () => {
    const result = buildLaunchMetadata({
      postId: "123",
      name: "Hello",
      symbol: "$HI",
      website: "https://example.com",
    });
    expect(result.socials.website).toBe("https://example.com");
    expect(result.symbol).toBe("HI");
  });

  it("rejects an X link that does not match the source post", () => {
    expect(() =>
      buildLaunchMetadata({
        postId: "123",
        postUrl: "https://x.com/alice/status/999",
        name: "Hello",
        symbol: "HI",
      }),
    ).toThrow();
  });
});
