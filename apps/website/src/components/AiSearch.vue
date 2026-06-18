<template>
  <search-modal-snippet
    id="devicesdk-search"
    api-url="https://b055c14c-4193-411f-ace0-f26c753376ee.search.ai.cloudflare.com"
    placeholder="Search the docs"
    shortcut="k"
    use-meta-key="true"
    show-url="true"
    show-date="false"
  />
</template>

<script setup lang="ts">
import { useHead } from "@unhead/vue";

useHead({
  script: [
    {
      type: "module",
      src: "https://b055c14c-4193-411f-ace0-f26c753376ee.search.ai.cloudflare.com/assets/v0.0.36/search-snippet.es.js",
      integrity:
        "sha384-tCbxswEr96GUJpbehTSqs88zk8IooboBlMfdQJmGvUiNLfq4eDwumEFyuHh7Onw1",
      crossorigin: "anonymous",
    },
  ],
});
</script>
