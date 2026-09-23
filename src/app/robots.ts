import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/explore", "/post/", "/terms", "/privacy", "/risk"],
        disallow: ["/api/", "/social/", "/profile"],
      },
    ],
    sitemap: "https://xlaunch.it/sitemap.xml",
    host: "https://xlaunch.it",
  };
}
