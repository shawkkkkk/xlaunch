export type ParsedXPost = {
  id: string;
  canonicalUrl: string;
  sourceKey: string;
  suppliedUrl: string;
};

const STATUS_RE = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(?:[^/?#]+\/status|i\/status)\/(\d+)/i;

export function parseXPostUrl(input: string): ParsedXPost {
  const value = input.trim();
  const match = value.match(STATUS_RE);
  if (!match) throw new Error("Paste a valid X post URL.");
  const id = match[1];
  return {
    id,
    sourceKey: `x:${id}`,
    canonicalUrl: `https://x.com/i/status/${id}`,
    suppliedUrl: value,
  };
}

export function isXPostUrl(input: string) {
  try {
    parseXPostUrl(input);
    return true;
  } catch {
    return false;
  }
}
