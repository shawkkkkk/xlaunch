import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://xlaunch.it",
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://xlaunch.it/explore",
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: "https://xlaunch.it/terms",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://xlaunch.it/privacy",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://xlaunch.it/risk",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
