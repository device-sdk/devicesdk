export interface DocPage {
	slug: string;
	path: string;
	title: string;
	description?: string;
	content: string;
	headings: DocHeading[];
	parent?: string;
	order?: number;
	isSection?: boolean;
}

export interface DocHeading {
	level: number;
	text: string;
	id: string;
}

export interface DocTreeNode {
	slug: string;
	path: string;
	title: string;
	children: DocTreeNode[];
	isSection: boolean;
}

export interface DocsIndex {
	pages: DocPage[];
	tree: DocTreeNode[];
}

export function getDocBySlug(
	index: DocsIndex,
	slug: string | string[],
): DocPage | undefined {
	const normalized = Array.isArray(slug) ? slug.join("/") : slug;
	return index.pages.find((p) => p.slug === normalized);
}

export function getDocByPath(
	index: DocsIndex,
	path: string,
): DocPage | undefined {
	return index.pages.find((p) => p.path === path);
}

export function findAdjacentDocs(index: DocsIndex, slug: string) {
	const flat = index.pages.filter((p) => !p.isSection);
	const idx = flat.findIndex((p) => p.slug === slug);
	return {
		prev: idx > 0 ? flat[idx - 1] : undefined,
		next: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : undefined,
	};
}
