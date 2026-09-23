import { describe, expect, it } from "vitest";
import { parseXPostUrl } from "../src/lib/xpost";

describe("X post canonicalization", () => {
  it("normalizes x.com URLs", () => {
    expect(parseXPostUrl("https://x.com/alice/status/123456?s=20").sourceKey).toBe("x:123456");
  });

  it("normalizes twitter.com and media suffixes to the same id", () => {
    const a = parseXPostUrl("https://twitter.com/alice/status/987/photo/1");
    const b = parseXPostUrl("https://x.com/i/status/987");
    expect(a.sourceKey).toBe(b.sourceKey);
  });

  it("rejects profile URLs", () => {
    expect(() => parseXPostUrl("https://x.com/alice")).toThrow();
  });
});
