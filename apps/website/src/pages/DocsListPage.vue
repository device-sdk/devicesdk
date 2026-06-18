<template>
  <div class="bg-white">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="max-w-4xl">
        <!-- Header -->
        <div class="mb-12">
          <h1 class="text-5xl font-bold text-gray-900 mb-4">{{ page?.title }}</h1>
          <p v-if="page?.description" class="text-xl text-gray-600">{{ page.description }}</p>
        </div>

        <!-- Main Content -->
        <div class="prose prose-gray prose-lg max-w-none mb-16" v-html="page?.html"></div>

        <!-- Child Cards -->
        <div v-if="childCards.length > 0">
          <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{{ cardsHeading }}</h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <a
              v-for="card in childCards"
              :key="card.path"
              :href="card.path"
              class="group flex flex-col p-6 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all"
            >
              <div class="flex items-center gap-3 mb-3">
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                  :class="card.iconBgClass"
                >
                  <svg
                    class="w-5 h-5"
                    :class="card.iconClass"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    v-html="card.iconPath"
                  />
                </div>
                <h3 class="text-lg font-semibold text-gray-900">{{ card.title }}</h3>
              </div>
              <p v-if="card.description" class="text-sm text-gray-600 line-clamp-2">{{ card.description }}</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePageData, usePageByPath, type PageData } from "@/composables/usePageContent";
import { DOCS_SECTION_ORDER } from "@/composables/useDocsNav";
import { useSiteHead } from "@/composables/useSiteHead";
import "@/styles/docs.css";

interface Card {
	path: string;
	title: string;
	description: string;
	iconPath: string;
	iconBgClass: string;
	iconClass: string;
}

const page = usePageData();
useSiteHead(page);

const cardsHeading = computed(() =>
	page.value?.path === "/docs/" ? "Browse documentation" : "Pages in this section",
);

const ICONS: Record<string, { path: string; bg: string; color: string }> = {
	quickstart: {
		path: "M13 10V3L4 14h7v7l9-11h-7z",
		bg: "bg-blue-50 group-hover:bg-blue-100",
		color: "text-blue-600",
	},
	"first-device": {
		path: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
		bg: "bg-green-50 group-hover:bg-green-100",
		color: "text-green-600",
	},
	cli: {
		path: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
		bg: "bg-purple-50 group-hover:bg-purple-100",
		color: "text-purple-600",
	},
	concepts: {
		path: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
		bg: "bg-orange-50 group-hover:bg-orange-100",
		color: "text-orange-600",
	},
	guides: {
		path: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
		bg: "bg-indigo-50 group-hover:bg-indigo-100",
		color: "text-indigo-600",
	},
	recipes: {
		path: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
		bg: "bg-amber-50 group-hover:bg-amber-100",
		color: "text-amber-600",
	},
	hardware: {
		path: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
		bg: "bg-red-50 group-hover:bg-red-100",
		color: "text-red-600",
	},
	mcp: {
		path: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
		bg: "bg-pink-50 group-hover:bg-pink-100",
		color: "text-pink-600",
	},
	errors: {
		path: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
		bg: "bg-rose-50 group-hover:bg-rose-100",
		color: "text-rose-600",
	},
	changelog: {
		path: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
		bg: "bg-cyan-50 group-hover:bg-cyan-100",
		color: "text-cyan-600",
	},
	resources: {
		path: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
		bg: "bg-yellow-50 group-hover:bg-yellow-100",
		color: "text-yellow-600",
	},
};

function iconForPath(path: string): { path: string; bg: string; color: string } {
	const segment = path.split("/").filter(Boolean)[1] ?? "";
	return (
		ICONS[segment] ?? {
			path: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
			bg: "bg-gray-50 group-hover:bg-gray-100",
			color: "text-gray-600",
		}
	);
}

function cardForPage(p: PageData): Card {
	const icon = iconForPath(p.path);
	return {
		path: p.path,
		title: p.title,
		description: p.description,
		iconPath: icon.path,
		iconBgClass: icon.bg,
		iconClass: icon.color,
	};
}

const childCards = computed<Card[]>(() => {
	const paths = page.value?.children ?? [];
	const pages = paths
		.map((path) => usePageByPath(path))
		.filter((p): p is PageData => p !== undefined);
	return pages
		.sort((a, b) => {
			const oa = DOCS_SECTION_ORDER[a.path] ?? 999;
			const ob = DOCS_SECTION_ORDER[b.path] ?? 999;
			if (oa !== ob) return oa - ob;
			if (a.weight !== b.weight) return a.weight - b.weight;
			return a.title.localeCompare(b.title);
		})
		.map(cardForPage);
});
</script>
