import { computed, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import generated from "@/generated/content.json";

export interface PageData {
	path: string;
	sourcePath: string;
	sourceType: "content" | "docs";
	isSection: boolean;
	title: string;
	description: string;
	socialImage: string;
	html: string;
	rawMarkdown: string;
	tocHtml: string;
	children: string[];
	weight: number;
	lastmod: string | null;
}

export interface ContentIndex {
	pages: PageData[];
}

const content = generated as ContentIndex;

export function usePageData(): ComputedRef<PageData | undefined> {
	const route = useRoute();
	return computed(() => content.pages.find((p) => p.path === route.path));
}

export function usePageByPath(path: string): PageData | undefined {
	return content.pages.find((p) => p.path === path);
}

export function useAllPages(): PageData[] {
	return content.pages;
}
