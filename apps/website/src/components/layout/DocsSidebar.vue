<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import type { DocsIndex, DocTreeNode } from "~/utils/docs";

const props = defineProps<{
	index: DocsIndex;
}>();

const route = useRoute();
const currentPath = computed(() => route.path);

const navGroups = computed(() => {
	const groups: { title: string; items: DocTreeNode[] }[] = [];
	for (const node of props.index.tree) {
		if (node.isSection && node.children.length) {
			groups.push({ title: node.title, items: node.children });
		} else {
			const last = groups[groups.length - 1];
			if (last) {
				last.items.push(node);
			} else {
				groups.push({ title: "Pages", items: [node] });
			}
		}
	}
	return groups;
});
</script>

<template>
  <aside class="docs-sidebar" id="mobile-sidebar">
    <div class="docs-sidebar-content">
      <div class="mb-6">
        <a href="/docs/" class="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors">
          Documentation
        </a>
      </div>
      <nav class="space-y-8">
        <div v-for="group in navGroups" :key="group.title">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{{ group.title }}</h3>
          <ul class="space-y-2">
            <li v-for="item in group.items" :key="item.path">
              <a
                :href="item.path"
                class="docs-nav-link"
                :class="{ active: currentPath === item.path }"
              >
                {{ item.title }}
              </a>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  </aside>
</template>

<style scoped>
.docs-sidebar {
  position: sticky;
  top: 64px;
  max-height: calc(100vh - 64px);
  overflow: hidden;
  border-right: 1px solid #e5e7eb;
  padding: 2rem 1.5rem;
}

.docs-nav-link {
  display: block;
  font-size: 0.875rem;
  color: #6b7280;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  transition: all 0.15s ease;
}

.docs-nav-link:hover {
  color: #111827;
  background-color: #f3f4f6;
}

.docs-nav-link.active {
  color: #111827;
  background-color: #f3f4f6;
  font-weight: 500;
}

@media (max-width: 1024px) {
  .docs-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100vh;
    z-index: 40;
    border-right: 1px solid #e5e7eb;
    background: white;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    padding-top: 6.75rem;
    overflow-y: auto;
  }

  .docs-sidebar.open {
    transform: translateX(0);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }
}
</style>
