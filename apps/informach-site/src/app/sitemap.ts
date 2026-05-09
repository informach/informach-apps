import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE.url}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/termos`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE.url}/privacidade`, lastModified, changeFrequency: "yearly", priority: 0.5 },
  ];
}
