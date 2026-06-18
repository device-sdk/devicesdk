<template>
  <aside class="docs-sidebar" id="mobile-sidebar">
    <div class="docs-sidebar-content">
      <div class="mb-6">
        <a
          href="/docs/"
          :class="[
            'flex items-center gap-2 text-sm font-semibold transition-colors',
            isActive('/docs/') ? 'text-emerald-600' : 'text-gray-900 hover:text-gray-600',
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
          {{ docsHome?.title ?? 'Documentation' }}
        </a>
      </div>

      <nav class="space-y-1">
        <!-- Standalone top-level pages -->
        <template v-for="page in standalonePages" :key="page.path">
          <a
            :href="page.path"
            :class="[
              'docs-nav-link',
              isActive(page.path) && 'active',
            ]"
          >
            {{ page.title }}
          </a>
        </template>

        <!-- Collapsible sections -->
        <div v-for="section in sections" :key="section.path" class="pt-2">
          <div class="flex items-center">
            <a
              :href="section.path"
              :class="[
                'docs-nav-link flex-1 font-medium',
                (isActive(section.path) || isSectionActive(section.path)) && 'active',
              ]"
            >
              {{ section.title }}
            </a>
            <button
              type="button"
              class="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              :aria-expanded="isSectionExpanded(section.path)"
              :aria-controls="`section-${section.path}`"
              @click.prevent="toggleSection(section.path)"
            >
              <svg
                class="w-3.5 h-3.5 transition-transform duration-200"
                :class="isSectionExpanded(section.path) ? 'rotate-90' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          <div
            :id="`section-${section.path}`"
            v-show="isSectionExpanded(section.path)"
            class="ml-2 mt-1 space-y-1"
          >
            <a
              v-for="child in section.children"
              :key="child.path"
              :href="child.path"
              :class="[
                'docs-nav-link pl-5',
                isActive(child.path) && 'active',
              ]"
            >
              {{ child.title }}
            </a>
          </div>
        </div>
      </nav>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useDocsNav } from "@/composables/useDocsNav";

const {
	docsHome,
	standalonePages,
	sections,
	toggleSection,
	isSectionExpanded,
	isActive,
	isSectionActive,
} = useDocsNav();
</script>
