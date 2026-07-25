import { useHead } from "@unhead/vue";
import { computed, type ComputedRef } from "vue";
import {
  DISCORD_URL,
  GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  TWITTER_URL,
} from "@/config";
import { type PageData } from "./usePageContent";

interface JsonLd {
  "@context": string;
  "@type": string;
  [key: string]: unknown;
}

function absoluteUrl(relative: string): string {
  if (!relative) return "";
  if (relative.startsWith("http")) return relative;
  return `${SITE_URL}${relative}`;
}

function jsonLdScript(data: JsonLd | JsonLd[]): { type: string; innerHTML: string } {
  return {
    type: "application/ld+json",
    innerHTML: JSON.stringify(data, null, 2),
  };
}

export function useSiteHead(
  pageRef: ComputedRef<PageData | undefined>,
): void {
  useHead(() => {
    const page = pageRef.value;
    const title = page?.title || SITE_TITLE;
    const description = page?.description || SITE_DESCRIPTION;
    const canonical = page ? absoluteUrl(page.path) : `${SITE_URL}/`;
    const ogImage = absoluteUrl(page?.socialImage || "");
    const isHome = page?.path === "/";
    const isPrivacy = page?.path === "/privacy/";
    const isTerms = page?.path === "/terms/";
    const isSection = page?.isSection ?? false;

    const htmlTitle = isHome ? SITE_TITLE : title;

    const meta: Array<Record<string, string>> = [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      {
        property: "og:type",
        content:
          isHome || (isSection && !isPrivacy && !isTerms) ? "website" : "article",
      },
      { property: "og:url", content: canonical },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];

    if (ogImage) {
      meta.push({ property: "og:image", content: ogImage });
      meta.push({ name: "twitter:image", content: ogImage });
    }

    const scripts: Array<{ type: string; innerHTML: string }> = [];

    if (isHome) {
      const orgRef: JsonLd = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "DeviceSDK",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/logo.svg`,
      };
      const org: JsonLd = {
        ...orgRef,
        description: SITE_DESCRIPTION,
        sameAs: [GITHUB_URL, TWITTER_URL, DISCORD_URL],
      };
      const website: JsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "DeviceSDK",
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        publisher: orgRef,
      };
      scripts.push(jsonLdScript([org, website]));
    }

    return {
      title: htmlTitle,
      link: [{ rel: "canonical", href: canonical }],
      meta,
      script: scripts,
    };
  });
}
