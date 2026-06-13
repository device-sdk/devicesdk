<template>
  <q-dialog
    :model-value="modelValue"
    :persistent="!!newToken && !copied"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card class="dialog-card" style="min-width: 600px; max-width: 700px">
      <q-card-section class="dialog-header row items-center q-pb-md">
        <div>
          <div class="text-h5 text-weight-bold">Create API Token</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            {{ newToken ? "Save this token securely — it won't be shown again" : 'Generate a new API token for programmatic access' }}
          </div>
        </div>
        <q-space />
        <q-btn
          icon="close"
          flat
          round
          dense
          class="close-btn"
          aria-label="Close"
          @click="attemptClose"
        />
      </q-card-section>

      <q-separator />

      <q-form v-if="!newToken" @submit="createToken" class="q-pa-lg">
        <div class="info-banner q-mb-lg">
          <q-icon name="info" size="24px" color="primary" class="q-mr-md" />
          <div>
            <div class="text-weight-medium">What are API tokens?</div>
            <div class="text-caption text-grey-7">API tokens allow you to authenticate API requests without using your password.</div>
          </div>
        </div>

        <div class="q-gutter-md q-mb-md">
          <q-input
            v-model="description"
            label="Description"
            placeholder="Describe what this token is used for"
            autofocus
            autogrow
            outlined
            dense
            maxlength="200"
          />

          <q-toggle
            v-model="managed"
            label="Managed token"
            color="primary"
            dense
            keep-color
            :false-value="false"
            :true-value="true"
          >
            <q-tooltip>Mark as managed if provisioned by the platform or automation</q-tooltip>
          </q-toggle>
        </div>

        <q-separator class="q-mb-md" />

        <q-card-actions align="right" class="q-px-none">
          <q-btn
            outline
            label="Cancel"
            color="grey-7"
            v-close-popup
            style="min-width: 120px"
          />
          <q-btn
            unelevated
            label="Generate Token"
            color="primary"
            type="submit"
            :loading="creating"
            icon-right="vpn_key"
            class="create-btn"
            style="min-width: 150px"
          />
        </q-card-actions>
      </q-form>

      <div v-else class="q-pa-lg">
        <div class="success-banner q-mb-lg">
          <q-icon name="check_circle" size="32px" color="positive" />
          <div class="q-ml-md">
            <div class="text-h6 text-weight-bold">Token Created Successfully!</div>
            <div class="text-caption text-grey-7">Make sure to copy it now — you won't see it again</div>
          </div>
        </div>

        <div class="token-section q-mb-lg">
          <div class="text-subtitle2 text-weight-medium q-mb-sm">
            <q-icon name="vpn_key" class="q-mr-xs" /> Your API Token
          </div>
          <div class="token-display">
            <q-input
              :model-value="newToken"
              readonly
              outlined
              dense
              class="font-mono"
            />
            <q-btn
              unelevated
              color="primary"
              icon="content_copy"
              label="Copy"
              aria-label="Copy token to clipboard"
              @click="copyToClipboard(newToken, 'token')"
            />
          </div>
          <div v-if="!copied" class="text-caption text-warning q-mt-sm">
            <q-icon name="warning" size="14px" class="q-mr-xs" />
            Copy this token before closing — it can't be retrieved later.
          </div>
        </div>

        <div class="code-section q-mb-lg">
          <div class="text-subtitle2 text-weight-medium q-mb-sm">
            <q-icon name="code" class="q-mr-xs" /> Example Usage
          </div>
          <div class="code-block">
            <pre class="code-content font-mono">{{ codeSnippet }}</pre>
            <q-btn
              flat
              color="primary"
              icon="content_copy"
              size="sm"
              class="copy-code-btn"
              aria-label="Copy code snippet"
              @click="copyToClipboard(codeSnippet, 'snippet')"
            >
              <q-tooltip>Copy code</q-tooltip>
            </q-btn>
          </div>
        </div>

        <q-separator class="q-mb-md" />

        <q-card-actions align="right" class="q-px-none">
          <q-btn
            unelevated
            label="Done"
            color="primary"
            class="create-btn"
            style="min-width: 150px"
            @click="attemptClose"
          />
        </q-card-actions>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { tokenService } from '@/services/api.service';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'token-created': [];
}>();

const $q = useQuasar();
const creating = ref(false);
const newToken = ref<string | null>(null);
const description = ref<string>('');
const managed = ref<boolean>(false);
// Tracks whether the freshly-created token has been copied at least once, so we
// can warn before the user closes and loses it forever.
const copied = ref(false);

const codeSnippet = computed(() => {
  const origin = window.location.origin;
  return `curl -X GET ${origin}/v1/user/me \\
  -H "Authorization: Bearer ${newToken.value}"`;
});

const createToken = async () => {
  try {
    creating.value = true;
    const payload: Record<string, unknown> = {};
    const trimmed = description.value.trim();
    if (trimmed) {
      payload.description = trimmed;
    }
    payload.managed = managed.value;

    const response = await tokenService.create(payload);
    newToken.value = response.token;
    copied.value = false;
    emit('token-created');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create token';
    $q.notify({
      type: 'negative',
      message,
      position: 'top',
    });
  } finally {
    creating.value = false;
  }
};

const copyToClipboard = (text: string, type: string) => {
  void navigator.clipboard.writeText(text);
  if (type === 'token') copied.value = true;
  $q.notify({
    type: 'positive',
    message: `${type === 'token' ? 'Token' : 'Snippet'} copied to clipboard`,
    position: 'top',
  });
};

// Guard the close path: if a token was generated but never copied, confirm
// first since it can't be shown again.
const attemptClose = () => {
  if (newToken.value && !copied.value) {
    $q.dialog({
      title: 'Close without copying?',
      message:
        "You haven't copied your token yet. It won't be shown again after you close this dialog.",
      cancel: { label: 'Keep open', flat: true },
      ok: { label: 'Close anyway', color: 'negative', unelevated: true },
      persistent: true,
    }).onOk(() => {
      emit('update:modelValue', false);
    });
    return;
  }
  emit('update:modelValue', false);
};

watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) {
      newToken.value = null;
      description.value = '';
      managed.value = false;
      copied.value = false;
    }
  }
);
</script>

<style scoped lang="scss">
.dialog-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.dialog-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.close-btn {
  color: var(--foreground-muted);

  &:hover {
    color: var(--foreground);
    background: var(--accent);
  }
}

.info-banner {
  display: flex;
  align-items: center;
  background: var(--background-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  padding: 1rem;
  border-radius: var(--radius);
}

.success-banner {
  display: flex;
  align-items: center;
  background: var(--background-secondary);
  border: 1px solid var(--border);
  border-left: 3px solid var(--success);
  padding: 1.25rem;
  border-radius: var(--radius);
}

.token-section,
.code-section {
  background: var(--background-secondary);
  padding: 1.25rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.token-display {
  display: flex;
  gap: 0.5rem;

  :deep(.q-input) {
    flex: 1;
  }
}

.code-block {
  position: relative;
  background: hsl(240, 10%, 10%);
  border-radius: var(--radius);
  padding: 1rem;
  overflow-x: auto;
}

.code-content {
  color: hsl(0, 0%, 85%);
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre;
}

.copy-code-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.875rem;
}

.create-btn {
  font-weight: 500;
}
</style>
