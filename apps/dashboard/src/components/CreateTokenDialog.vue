<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card class="dialog-card" style="min-width: 600px; max-width: 700px">
      <q-card-section class="dialog-header row items-center q-pb-md">
        <div>
          <div class="text-h5 text-weight-bold">Create API Token</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            {{ newToken ? 'Save this token securely - it won\'t be shown again' : 'Generate a new API token for programmatic access' }}
          </div>
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup class="close-btn" />
      </q-card-section>

      <q-separator />

      <q-form v-if="!newToken" @submit="createToken" class="q-pa-lg">
        <div class="info-banner q-mb-lg">
          <q-icon name="info" size="24px" class="q-mr-md" />
          <div>
            <div class="text-weight-medium">What are API tokens?</div>
            <div class="text-caption">API tokens allow you to authenticate API requests without using your password.</div>
          </div>
        </div>

        <div class="q-gutter-md q-mb-md">
          <q-input
            v-model="description"
            label="Description"
            placeholder="Describe what this token is used for"
            autogrow
            outlined
            dense
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
            class="action-btn"
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
            <div class="text-caption text-grey-7">Make sure to copy it now - you won't see it again</div>
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
              @click="copyToClipboard(newToken, 'token')"
              class="copy-btn"
            />
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
            v-close-popup
            class="create-btn"
            style="min-width: 150px"
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

const codeSnippet = computed(
  () => `curl -X GET https://api.devicesdk.com/v1/user/me \\
  -H "Authorization: Bearer ${newToken.value}"`
);

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
  $q.notify({
    type: 'positive',
    message: `${type === 'token' ? 'Token' : 'Snippet'} copied to clipboard`,
    position: 'top',
  });
};

watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) {
      newToken.value = null;
      description.value = '';
      managed.value = false;
    }
  }
);
</script>

<style scoped lang="scss">
.dialog-card {
  border-radius: 16px;
  overflow: hidden;
}

.dialog-header {
  background: linear-gradient(135deg, #f8f9fa 0%, #f0f0f5 100%);
  padding: 1.5rem;
}

.close-btn {
  transition: all 0.3s ease;
  
  &:hover {
    transform: rotate(90deg);
  }
}

.info-banner {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #e3f2fd 0%, #e8eaf6 100%);
  border-left: 4px solid #667eea;
  padding: 1rem;
  border-radius: 8px;
}

.success-banner {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%);
  border-left: 4px solid #4caf50;
  padding: 1.5rem;
  border-radius: 8px;
}

.token-section {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
}

.token-display {
  display: flex;
  gap: 0.5rem;
  
  :deep(.q-input) {
    flex: 1;
  }
  
  :deep(.q-field__control) {
    background: white;
    border-radius: 8px;
  }
}

.copy-btn {
  min-width: 100px;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
  }
}

.code-section {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
}

.code-block {
  position: relative;
  background: #2d2d2d;
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
}

.code-content {
  color: #a9b7c6;
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre;
}

.copy-code-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.font-mono {
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
}

.create-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
}

.action-btn {
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
  }
}
</style>
