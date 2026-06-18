<template>
  <section class="pt-8 pb-20 px-4 sm:px-6 lg:px-8 bg-zinc-50">
    <div class="max-w-5xl mx-auto">
      <div class="grid lg:grid-cols-4 gap-12">
        <!-- Sticky TOC Sidebar -->
        <nav class="hidden lg:block lg:col-span-1">
          <div class="sticky top-24">
            <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">On this page</h3>
            <div id="TableOfContents" v-html="page?.tocHtml"></div>
          </div>
        </nav>

        <!-- Content -->
        <div class="lg:col-span-3 prose-legal">
          <div v-html="page?.html"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { usePageData } from "@/composables/usePageContent";
import { useSiteHead } from "@/composables/useSiteHead";

const page = usePageData();
useSiteHead(page);
</script>
