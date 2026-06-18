<template>
  <!-- WebMCP bridge is injected via head script. -->
</template>

<script setup lang="ts">
import { useHead } from "@unhead/vue";

const mcpEndpoint = "https://b055c14c-4193-411f-ace0-f26c753376ee.search.ai.cloudflare.com/mcp";

useHead({
  script: [
    {
      type: "module",
      innerHTML: `
const mcpEndpoint = ${JSON.stringify(mcpEndpoint)};

if (navigator.modelContext && typeof navigator.modelContext.provideContext === "function") {
  async function callUpstream(query, limit) {
    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: "search",
        arguments: { query, ai_search_options: { max_num_results: limit } },
      },
    };
    const resp = await fetch(mcpEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(\`search upstream returned \${resp.status}\`);
    const raw = await resp.text();
    const dataLine = raw.split("\\n").find((l) => l.startsWith("data:"));
    const payload = JSON.parse(dataLine ? dataLine.slice(5).trim() : raw);
    if (payload.error) throw new Error(payload.error.message || "search failed");
    const inner = JSON.parse(payload.result.content[0].text);
    if (!inner.success) throw new Error(inner.error || "search failed");
    return inner.result.chunks || [];
  }

  function chunkToResult(chunk) {
    const titleMatch = /^title:\\s*(.+)$/m.exec(chunk.text || "");
    const text = (chunk.text || "").replace(/^---[\\s\\S]*?---\\s*/, "").trim();
    return {
      title: titleMatch ? titleMatch[1].trim() : "DeviceSDK docs",
      score: chunk.score,
      excerpt: text.slice(0, 500),
    };
  }

  navigator.modelContext.provideContext({
    tools: [
      {
        name: "search_docs",
        description:
          "Search the DeviceSDK documentation, API reference, and hardware guides. Returns relevant excerpts with titles and relevance scores.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Free-text search query." },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 20,
              default: 5,
              description: "Maximum number of results to return.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
        async execute({ query, limit }) {
          try {
            const n = Math.max(1, Math.min(20, Number.isFinite(limit) ? limit : 5));
            const chunks = await callUpstream(query, n);
            const results = chunks.slice(0, n).map(chunkToResult);
            return {
              content: [{ type: "text", text: JSON.stringify({ query, results }, null, 2) }],
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: \`search_docs failed: \${err.message || err}\` }],
              isError: true,
            };
          }
        },
      },
    ],
  });
}
`,
    },
  ],
});
</script>
