---
name: write-vue-components
description: Use when creating or modifying Vue components in apps/dashboard/ (Quasar) or apps/simulation/ (Tailwind). Covers Composition API, Quasar components, Tailwind v4, services, composables, and canvas rendering.
---

# Write Vue Components

This codebase has two Vue apps with different UI frameworks. Identify the target before writing.

## Dashboard (Quasar) — `apps/dashboard/`

### Component Structure

```vue
<template>
  <q-page padding>
    <div class="row q-mb-md items-center justify-between">
      <div class="text-h5">Things</div>
      <q-btn color="primary" label="Create" @click="showCreateDialog = true" />
    </div>

    <q-table
      :rows="filteredItems"
      :columns="columns"
      :loading="loading"
      row-key="id"
      flat
      bordered
    >
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat icon="edit" @click="editItem(props.row)" />
          <q-btn flat icon="delete" color="negative" @click="deleteItem(props.row)" />
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="showCreateDialog">
      <q-card style="min-width: 400px">
        <q-card-section class="text-h6">Create Thing</q-card-section>
        <q-card-section>
          <q-form @submit="handleCreate">
            <q-input
              v-model="form.name"
              label="Name"
              :rules="[val => !!val || 'Required']"
            />
            <q-btn type="submit" label="Create" color="primary" class="q-mt-md" />
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useQuasar } from "quasar";
import { thingService } from "src/services/thingService";

const $q = useQuasar();
const items = ref<Thing[]>([]);
const loading = ref(false);
const showCreateDialog = ref(false);
const searchQuery = ref("");

const filteredItems = computed(() => {
  if (!searchQuery.value) return items.value;
  const q = searchQuery.value.toLowerCase();
  return items.value.filter(
    (item) =>
      item.name?.toLowerCase().includes(q) ||
      item.slug.toLowerCase().includes(q),
  );
});

const fetchItems = async () => {
  loading.value = true;
  try {
    items.value = await thingService.getAll();
  } finally {
    loading.value = false;
  }
};

const handleCreate = async () => {
  try {
    await thingService.create(form.value);
    showCreateDialog.value = false;
    $q.notify({ type: "positive", message: "Created successfully" });
    await fetchItems();
  } catch (err) {
    $q.notify({ type: "negative", message: "Failed to create" });
  }
};

onMounted(fetchItems);
</script>

<style lang="scss" scoped>
// Scoped SCSS with CSS custom properties
</style>
```

### Key Quasar Patterns

- **Dialogs**: `q-dialog` with `v-model` boolean toggle
- **Forms**: `q-form` with `@submit`, `q-input` with `:rules` array
- **Tables**: `q-table` with `:rows`, `:columns`, `:loading`, `row-key`
- **Notifications**: `useQuasar()` → `$q.notify({ type, message })`
- **Steppers**: `q-stepper` for multi-step flows (device setup wizard)
- **Layout**: `q-page padding`, row/column classes

### Services

Services encapsulate API calls in `src/services/`:

```typescript
// src/services/thingService.ts
import { api } from "./api";

export const thingService = {
  async getAll(): Promise<Thing[]> {
    const { data } = await api.get("/v1/things");
    return data.result;
  },
  async create(body: CreateThingPayload): Promise<Thing> {
    const { data } = await api.post("/v1/things", body);
    return data.result;
  },
};
```

### Linting and Type Checking

```bash
pnpm lint --filter @devicesdk/dashboard    # ESLint
pnpm check-types --filter @devicesdk/dashboard  # vue-tsc
```

---

## Simulation (Tailwind) — `apps/simulation/`

### Component Structure

```vue
<template>
  <div class="flex flex-col gap-4 p-4 bg-gray-900 text-white min-h-screen">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Device Simulator</h2>
      <button
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm"
        @click="handleAction"
      >
        Connect
      </button>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="bg-gray-800 rounded-lg p-4">
        <!-- Pin controls -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useSimulator } from "../composables/useSimulator";
import { useDeviceConnection } from "../composables/useDeviceConnection";

const { state, connect, disconnect } = useSimulator();
const { isConnected, send } = useDeviceConnection();

// Deep watchers for nested reactive state
watch(
  () => state.pins,
  (newPins) => {
    // Handle pin state changes
  },
  { deep: true },
);
</script>
```

### Composables

State management via composables in `src/composables/`:

```typescript
// src/composables/useSimulator.ts
import { ref, reactive } from "vue";

export function useSimulator() {
  const state = reactive({
    pins: new Map<number, PinState>(),
    connected: false,
  });

  function connect(url: string) { /* ... */ }
  function disconnect() { /* ... */ }

  return { state, connect, disconnect };
}
```

### Canvas Rendering

For hardware simulation (OLED display, LED matrix):

```typescript
// Pixel-perfect canvas rendering
const canvas = ref<HTMLCanvasElement | null>(null);

function renderFramebuffer(data: string) {
  const ctx = canvas.value?.getContext("2d");
  if (!ctx) return;

  const imageData = ctx.createImageData(128, 64);
  const decoded = atob(data);
  // Map framebuffer bytes to pixels...
  ctx.putImageData(imageData, 0, 0);
}
```

Use `imageRendering: pixelated` CSS for crisp pixel art scaling.

### Floating UI

Popovers use `@floating-ui/vue`:

```typescript
import { useFloating, offset, flip, shift } from "@floating-ui/vue";

const { floatingStyles } = useFloating(reference, floating, {
  placement: "top",
  middleware: [offset(8), flip(), shift()],
});
```

### Styling

- Tailwind CSS v4 utility classes (no `tailwind.config.js` — uses CSS-first config)
- Dark theme by default (bg-gray-900, text-white)
- Hardware simulation colors: dark green (#2A563F) for PCB, etc.

### Linting and Type Checking

```bash
pnpm lint --filter @devicesdk/simulation    # Biome
pnpm check-types --filter @devicesdk/simulation  # vue-tsc
```

---

## Common Patterns (Both Apps)

- `<script setup lang="ts">` with Composition API (no Options API)
- `ref()` for primitive reactive state, `reactive()` for objects
- `computed()` for derived state
- `onMounted()` for initial data fetching
- `watch()` / `watchEffect()` for side effects
- Props via `defineProps<{ ... }>()`, emits via `defineEmits<{ ... }>()`
- Type imports: `import type { Thing } from "@devicesdk/core"`

## Checklist

- [ ] Uses `<script setup lang="ts">` with Composition API
- [ ] Correct UI framework for target app (Quasar for dashboard, Tailwind for simulation)
- [ ] Reactive state with `ref()` or `reactive()`
- [ ] API calls through services (dashboard) or composables (simulation)
- [ ] Error handling with user feedback (Quasar notify or UI state)
- [ ] Type-safe props and emits
- [ ] Linter passes (`pnpm lint --filter ...`)
- [ ] Type check passes (`pnpm check-types --filter ...`)
