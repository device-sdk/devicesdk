<template>
  <SiteHeader />

  <main class="pt-14">
    <router-view />
  </main>

  <SiteFooter />

  <AiSearch />
  <WebMcp />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useHead } from "@unhead/vue";
import AiSearch from "@/components/AiSearch.vue";
import SiteFooter from "@/components/SiteFooter.vue";
import SiteHeader from "@/components/SiteHeader.vue";
import WebMcp from "@/components/WebMcp.vue";
import { SITE_TITLE } from "@/config";

useHead({
  titleTemplate: (title) =>
    title && title !== SITE_TITLE ? `${title} | DeviceSDK` : SITE_TITLE,
  meta: [
    { property: "og:site_name", content: "DeviceSDK" },
    { property: "og:locale", content: "en_US" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@devicesdk" },
  ],
});

onMounted(() => {
  const menuBtn = document.getElementById("mobile-menu-button");
  const menu = document.getElementById("mobile-menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => menu.classList.toggle("hidden"));
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-in", "is-revealed");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
  );

  document
    .querySelectorAll(".fade-up, .reveal, .reveal-stagger")
    .forEach((el) => revealObserver.observe(el));

  const nav = document.querySelector("nav");
  const onScroll = () => {
    if (nav) {
      if (window.scrollY > 10) nav.classList.add("border-b-zinc-700");
      else nav.classList.remove("border-b-zinc-700");
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  onUnmounted(() => {
    window.removeEventListener("scroll", onScroll);
    revealObserver.disconnect();
    if (menuBtn && menu) {
      menuBtn.removeEventListener("click", () => menu.classList.toggle("hidden"));
    }
  });
});
</script>
