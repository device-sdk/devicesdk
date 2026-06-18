<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@vueuse/head";
import DocsSidebar from "~/components/layout/DocsSidebar.vue";
import DocsToc from "~/components/layout/DocsToc.vue";
import { md } from "~/utils/markdown";
import docsIndex from "~/generated/docs-index.json";
import type { DocPage } from "~/utils/docs";

const route = useRoute();
const slug = computed(() => {
	const raw = route.params.slug;
	const joined = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
	return joined.replace(/\/$/, "");
});

const doc = computed<DocPage | undefined>(() => {
	if (!slug.value) {
		return docsIndex.pages.find((p: DocPage) => p.path === "/docs/");
	}
	return docsIndex.pages.find((p: DocPage) => p.slug === slug.value);
});

const rendered = computed(() => {
	if (!doc.value) return "";
	return md.render(doc.value.content);
});

useHead({
	title: computed(() =>
		doc.value
			? `${doc.value.title} | DeviceSDK Docs`
			: "Documentation | DeviceSDK",
	),
	meta: [
		{
			name: "description",
			content: computed(
				() => doc.value?.description ?? "DeviceSDK documentation",
			),
		},
	],
});
</script>

<template>
  <div class="bg-white">
    <div class="docs-container">
      <DocsSidebar :index="docsIndex" />

      <main class="docs-main">
        <article v-if="doc" class="docs-article">
          <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">{{ doc.title }}</h1>
            <p v-if="doc.description" class="text-lg text-gray-600">{{ doc.description }}</p>
          </div>
          <div class="prose-docs max-w-none" v-html="rendered"></div>
        </article>
        <div v-else class="docs-article py-20 text-center">
          <h1 class="text-2xl font-bold text-gray-900">Page not found</h1>
          <p class="mt-2 text-gray-600">The requested documentation page could not be found.</p>
          <a href="/docs/" class="mt-4 inline-block text-blue-600 hover:underline">Return to docs</a>
        </div>
      </main>

      <DocsToc v-if="doc" :headings="doc.headings" />
    </div>
  </div>
</template>

<style scoped>
.docs-container {
  display: grid;
  grid-template-columns: 260px 1fr 200px;
  max-width: 1440px;
  margin: 0 auto;
  min-height: calc(100vh - 64px);
}

.docs-main {
  padding: 3rem 4rem;
  max-width: 800px;
}

@media (max-width: 1024px) {
  .docs-container {
    grid-template-columns: 1fr;
    position: relative;
  }

  .docs-main {
    padding: 2rem 1.5rem;
  }
}
</style>
