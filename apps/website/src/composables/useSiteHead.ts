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
import { useAllPages, type PageData } from "./usePageContent";

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

function buildBreadcrumbList(page: PageData): JsonLd {
  const items: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }> = [];
  items.push({
    "@type": "ListItem",
    position: 1,
    name: "Home",
    item: `${SITE_URL}/`,
  });

  const segments = page.path.split("/").filter(Boolean);
  let accumulated = "";
  let position = 1;
  const pages = useAllPages();

  for (const segment of segments.slice(0, -1)) {
    accumulated += `/${segment}`;
    position += 1;
    const parent = pages.find((p) => p.path === `${accumulated}/`);
    items.push({
      "@type": "ListItem",
      position,
      name: parent?.title || segment,
      item: `${SITE_URL}${accumulated}/`,
    });
  }

  position += 1;
  items.push({
    "@type": "ListItem",
    position,
    name: page.title,
    item: absoluteUrl(page.path),
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

function buildTechArticle(page: PageData): JsonLd {
  const data: JsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description || SITE_DESCRIPTION,
    url: absoluteUrl(page.path),
    datePublished: page.lastmod || new Date().toISOString(),
    dateModified: page.lastmod || new Date().toISOString(),
    author: {
      "@type": "Organization",
      name: "DeviceSDK",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.svg`,
    },
    publisher: {
      "@type": "Organization",
      name: "DeviceSDK",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.svg`,
    },
  };
  const og = absoluteUrl(page.socialImage);
  if (og) data.image = og;
  return data;
}

export function useSiteHead(
  pageRef: ComputedRef<PageData | undefined>,
): void {
  const pages = useAllPages();

  useHead(() => {
    const page = pageRef.value;
    const title = page?.title || SITE_TITLE;
    const description = page?.description || SITE_DESCRIPTION;
    const canonical = page ? absoluteUrl(page.path) : `${SITE_URL}/`;
    const ogImage = absoluteUrl(page?.socialImage || "");
    const isHome = page?.path === "/";
    const isDocs = page?.sourceType === "docs";
    const isDocsLeaf = isDocs && !page?.isSection;
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
    } else if (isDocs && page) {
      const breadcrumbs = buildBreadcrumbList(page);
      scripts.push(jsonLdScript(breadcrumbs));
      if (isDocsLeaf) {
        scripts.push(jsonLdScript(buildTechArticle(page)));
      }
    }

    return {
      title: htmlTitle,
      link: [{ rel: "canonical", href: canonical }],
      meta,
      script: scripts,
    };
  });
}
