<script setup lang="ts">
import type { DocHeading } from "~/utils/docs";

defineProps<{
	headings: DocHeading[];
}>();
</script>

<template>
  <aside class="docs-toc" id="mobile-toc">
    <div class="docs-toc-content">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">On this page</h3>
      <nav id="TableOfContents">
        <ul>
          <li v-for="heading in headings" :key="heading.id" :class="heading.level === 3 ? 'ml-3' : ''">
            <a :href="`#${heading.id}`">{{ heading.text }}</a>
          </li>
        </ul>
      </nav>
    </div>
  </aside>
</template>

<style scoped>
.docs-toc {
  position: sticky;
  top: 64px;
  max-height: calc(100vh - 64px);
  overflow: hidden;
  padding: 2rem 1.5rem;
  border-left: 1px solid #e5e7eb;
}

@media (max-width: 1024px) {
  .docs-toc {
    position: fixed;
    top: 0;
    right: 0;
    width: 280px;
    height: 100vh;
    z-index: 40;
    border-left: 1px solid #e5e7eb;
    background: white;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    padding-top: 6.75rem;
    overflow-y: auto;
  }

  .docs-toc.open {
    transform: translateX(0);
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  }
}
</style>
