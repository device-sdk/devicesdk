import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAllPages, type PageData } from "./usePageContent";

/**
 * Logical reading order for top-level docs pages and sections.
 * Lower numbers appear first. Any path not listed here falls back to title sort.
 */
export const DOCS_SECTION_ORDER: Record<string, number> = {
	"/docs/": 0,
	"/docs/quickstart/": 1,
	"/docs/first-device/": 2,
	"/docs/cli/": 3,
	"/docs/concepts/": 4,
	"/docs/guides/": 5,
	"/docs/recipes/": 6,
	"/docs/hardware/": 7,
	"/docs/mcp/": 8,
	"/docs/errors/": 9,
	"/docs/changelog/": 10,
	"/docs/resources/": 11,
};

function sortPages(a: PageData, b: PageData): number {
	if (a.weight !== b.weight) return a.weight - b.weight;
	return a.title.localeCompare(b.title);
}

function sortByOrder(a: PageData, b: PageData): number {
	const oa = DOCS_SECTION_ORDER[a.path] ?? 999;
	const ob = DOCS_SECTION_ORDER[b.path] ?? 999;
	if (oa !== ob) return oa - ob;
	return sortPages(a, b);
}

function sectionPathFor(pagePath: string): string | null {
	const segments = pagePath.split("/").filter(Boolean);
	if (segments.length < 3) return null;
	return `/${segments[0]}/${segments[1]}/`;
}

export interface DocsNavChild {
	path: string;
	title: string;
	weight: number;
}

export interface DocsNavSection {
	path: string;
	title: string;
	weight: number;
	children: DocsNavChild[];
}

export function useDocsNav() {
	const route = useRoute();
	const allPages = useAllPages();

	const docsPages = computed(() => allPages.filter((p) => p.sourceType === "docs"));

	const sections = computed<DocsNavSection[]>(() => {
		const sectionMap = new Map<string, DocsNavSection>();
		const childMap = new Map<string, PageData[]>();

		for (const page of docsPages.value) {
			if (page.path === "/docs/") continue;

			if (page.isSection) {
				sectionMap.set(page.path, {
					path: page.path,
					title: page.title,
					weight: page.weight,
					children: [],
				});
				continue;
			}

			const sectionPath = sectionPathFor(page.path);
			if (sectionPath) {
				const existing = childMap.get(sectionPath) ?? [];
				existing.push(page);
				childMap.set(sectionPath, existing);
			}
		}

		for (const section of sectionMap.values()) {
			const children = childMap.get(section.path) ?? [];
			section.children = children.sort(sortPages).map((p) => ({
				path: p.path,
				title: p.title,
				weight: p.weight,
			}));
		}

		return Array.from(sectionMap.values()).sort((a, b) => {
			const oa = DOCS_SECTION_ORDER[a.path] ?? 999;
			const ob = DOCS_SECTION_ORDER[b.path] ?? 999;
			if (oa !== ob) return oa - ob;
			return a.title.localeCompare(b.title);
		});
	});

	const standalonePages = computed<PageData[]>(() => {
		return docsPages.value
			.filter((p) => !p.isSection && sectionPathFor(p.path) === null && p.path !== "/docs/")
			.sort(sortByOrder);
	});

	const docsHome = computed<PageData | undefined>(() =>
		docsPages.value.find((p) => p.path === "/docs/"),
	);

	const activeSectionPath = computed<string | null>(() => sectionPathFor(route.path));

	const expanded = ref<Set<string>>(new Set());

	function expandForPath(path: string) {
		const sectionPath = sectionPathFor(path);
		if (sectionPath) {
			expanded.value = new Set([...expanded.value, sectionPath]);
		}
	}

	watch(
		() => route.path,
		(path) => expandForPath(path),
		{ immediate: true },
	);

	function toggleSection(path: string) {
		const next = new Set(expanded.value);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		expanded.value = next;
	}

	function isSectionExpanded(path: string): boolean {
		return expanded.value.has(path);
	}

	function isActive(path: string): boolean {
		return route.path === path;
	}

	function isSectionActive(path: string): boolean {
		return activeSectionPath.value === path;
	}

	return {
		docsHome,
		standalonePages,
		sections,
		expanded,
		toggleSection,
		isSectionExpanded,
		isActive,
		isSectionActive,
	};
}

export function useDocsReadingOrder() {
	const route = useRoute();
	const allPages = useAllPages();

	const ordered = computed<PageData[]>(() => {
		const docsPages = allPages.filter((p) => p.sourceType === "docs" && p.path !== "/docs/");
		const sections = new Map<string, PageData[]>();
		const topLevel: PageData[] = [];

		for (const page of docsPages) {
			if (page.isSection || sectionPathFor(page.path) === null) {
				topLevel.push(page);
				continue;
			}

			const sectionPath = sectionPathFor(page.path);
			if (sectionPath) {
				const existing = sections.get(sectionPath) ?? [];
				existing.push(page);
				sections.set(sectionPath, existing);
			}
		}

		topLevel.sort(sortByOrder);

		const result: PageData[] = [];
		for (const item of topLevel) {
			result.push(item);
			if (item.isSection) {
				const children = sections.get(item.path) ?? [];
				result.push(...children.sort(sortPages));
			}
		}
		return result;
	});

	const currentIndex = computed(() => ordered.value.findIndex((p) => p.path === route.path));
	const prev = computed<PageData | undefined>(() =>
		currentIndex.value > 0 ? ordered.value[currentIndex.value - 1] : undefined,
	);
	const next = computed<PageData | undefined>(() =>
		currentIndex.value >= 0 && currentIndex.value < ordered.value.length - 1
			? ordered.value[currentIndex.value + 1]
			: undefined,
	);

	return { ordered, prev, next };
}
