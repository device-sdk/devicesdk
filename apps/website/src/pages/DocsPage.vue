<template>
  <!-- Mobile Navigation Buttons -->
  <div class="lg:hidden flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white fixed top-14 left-0 right-0 z-40">
    <button id="mobile-sidebar-toggle" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Toggle navigation">
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>
    <span class="text-sm font-medium text-gray-700 flex-1 truncate">{{ page?.title }}</span>
    <button id="mobile-toc-toggle" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Toggle table of contents">
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/>
      </svg>
    </button>
  </div>

  <div class="bg-white">
    <div class="docs-container">
      <!-- Sidebar Navigation -->
      <DocsSidebar />

      <!-- Main Content -->
      <main class="docs-main">
        <article class="docs-article">
          <div class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">{{ page?.title }}</h1>
            <p v-if="page?.description" class="text-lg text-gray-600">{{ page.description }}</p>
          </div>

          <div class="prose prose-gray max-w-none" v-html="page?.html"></div>

          <!-- Prev / Next -->
          <nav v-if="prev || next" class="mt-16 pt-8 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              v-if="prev"
              :href="prev.path"
              class="group flex flex-col p-4 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
            >
              <span class="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
                Previous
              </span>
              <span class="text-sm font-semibold text-gray-900 group-hover:text-emerald-700">{{ prev.title }}</span>
            </a>
            <div v-else></div>

            <a
              v-if="next"
              :href="next.path"
              class="group flex flex-col items-end text-right p-4 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors"
            >
              <span class="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                Next
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </span>
              <span class="text-sm font-semibold text-gray-900 group-hover:text-emerald-700">{{ next.title }}</span>
            </a>
          </nav>
        </article>
      </main>

      <!-- Table of Contents -->
      <aside class="docs-toc" id="mobile-toc">
        <div class="docs-toc-content">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">On this page</h3>
          <nav id="TableOfContents" v-html="page?.tocHtml"></nav>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import DocsSidebar from "@/components/DocsSidebar.vue";
import { usePageData } from "@/composables/usePageContent";
import { useDocsReadingOrder } from "@/composables/useDocsNav";
import { useSiteHead } from "@/composables/useSiteHead";
import "@/styles/docs.css";

const page = usePageData();
useSiteHead(page);

const { prev, next } = useDocsReadingOrder();

onMounted(() => {
  const sidebarToggle = document.getElementById("mobile-sidebar-toggle");
  const tocToggle = document.getElementById("mobile-toc-toggle");
  const sidebar = document.getElementById("mobile-sidebar");
  const toc = document.getElementById("mobile-toc");

  function toggleSidebar(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    sidebar?.classList.toggle("open");
    toc?.classList.remove("open");
  }

  function toggleToc(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    toc?.classList.toggle("open");
    sidebar?.classList.remove("open");
  }

  sidebarToggle?.addEventListener("click", toggleSidebar);
  tocToggle?.addEventListener("click", toggleToc);

  sidebar?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => sidebar.classList.remove("open"));
  });
  toc?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => toc.classList.remove("open"));
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      sidebar?.classList.remove("open");
      toc?.classList.remove("open");
    }
  }

  function onClick(e: MouseEvent) {
    const target = e.target as Node;
    if (sidebar?.classList.contains("open") && !sidebar.contains(target) && !sidebarToggle?.contains(target)) {
      sidebar.classList.remove("open");
    }
    if (toc?.classList.contains("open") && !toc.contains(target) && !tocToggle?.contains(target)) {
      toc.classList.remove("open");
    }
  }

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onClick);

  onUnmounted(() => {
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("click", onClick);
    sidebarToggle?.removeEventListener("click", toggleSidebar);
    tocToggle?.removeEventListener("click", toggleToc);
  });
});
</script>
