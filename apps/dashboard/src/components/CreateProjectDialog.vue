<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card class="dialog-card" style="min-width: 600px; max-width: 700px">
      <q-card-section class="dialog-header row items-center q-pb-md">
        <div>
          <div class="text-h5 text-weight-bold">Create New Project</div>
          <div class="text-caption text-grey-7 q-mt-xs">Set up a new IoT project</div>
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup class="close-btn" />
      </q-card-section>

      <q-separator />

      <q-stepper v-model="step" flat animated class="wizard-stepper">
        <q-step :name="1" title="CLI Setup" icon="terminal" :done="step > 1">
          <div class="q-pa-md">
            <div class="text-subtitle1 text-weight-medium q-mb-md">Recommended: Use the CLI</div>
            <p class="text-body2 text-grey-8 q-mb-lg">
              The fastest way to create a project is using the DeviceSDK CLI. Run the following command in your terminal:
            </p>
            <div class="code-block q-pa-md q-mb-md">
              <code class="text-primary">npx @devicesdk/cli init</code>
              <q-btn
                flat
                dense
                icon="content_copy"
                size="sm"
                class="copy-btn"
                @click="copyCommand"
              >
                <q-tooltip>Copy to clipboard</q-tooltip>
              </q-btn>
            </div>
            <p class="text-caption text-grey-6">
              This will guide you through creating a project with all the necessary files and configuration.
            </p>
          </div>
          <q-stepper-navigation>
            <q-btn flat label="Cancel" v-close-popup class="q-mr-sm" />
            <q-btn outline label="Create manually instead" color="primary" @click="step = 2" />
          </q-stepper-navigation>
        </q-step>

        <q-step :name="2" title="Project Details" icon="folder" :done="step > 2">
          <q-form @submit="onSubmit" class="q-pa-md">
            <div class="q-mb-lg">
              <div class="text-subtitle2 text-weight-medium q-mb-sm">
                <q-icon name="badge" class="q-mr-xs" /> Project Slug
              </div>
              <q-input
                v-model="form.projectId"
                outlined
                autofocus
                placeholder="e.g., smart-home-hub"
                :rules="[
                  val => !!val || 'Project slug is required',
                  val => val.length >= 1 && val.length <= 36 || 'Must be 1-36 characters',
                  val => /^[a-z][a-z0-9-]*$/.test(val) || 'Must start with a letter, only lowercase letters, numbers, and hyphens'
                ]"
                class="font-mono modern-input"
              >
                <template #prepend>
                  <q-icon name="folder" color="primary" />
                </template>
              </q-input>
              <div class="text-caption text-grey-6 q-mt-xs q-ml-sm">URL-safe identifier (e.g., my-iot-project)</div>
            </div>

            <div class="q-mb-lg">
              <div class="text-subtitle2 text-weight-medium q-mb-sm">
                <q-icon name="label" class="q-mr-xs" /> Project Name <span class="text-grey-5">(optional)</span>
              </div>
              <q-input
                v-model="form.name"
                outlined
                placeholder="e.g., Smart Home Hub"
                maxlength="100"
                class="modern-input"
              >
                <template #prepend>
                  <q-icon name="text_fields" color="grey-6" />
                </template>
              </q-input>
              <div class="text-caption text-grey-6 q-mt-xs q-ml-sm">Human-readable display name</div>
            </div>

            <div class="q-mb-md">
              <div class="text-subtitle2 text-weight-medium q-mb-sm">
                <q-icon name="description" class="q-mr-xs" /> Description <span class="text-grey-5">(optional)</span>
              </div>
              <q-input
                v-model="form.description"
                outlined
                type="textarea"
                rows="3"
                placeholder="Describe your project..."
                maxlength="500"
                class="modern-input"
              />
            </div>

            <q-stepper-navigation>
              <q-btn flat label="Back" @click="step = 1" class="q-mr-sm" />
              <q-btn
                unelevated
                label="Create Project"
                color="primary"
                type="submit"
                :loading="submitting"
                class="create-btn"
                icon-right="add_circle"
              />
            </q-stepper-navigation>
          </q-form>
        </q-step>
      </q-stepper>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { projectService } from '@/services/api.service';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'project-created': [];
}>();

const $q = useQuasar();
const submitting = ref(false);
const step = ref(1);
const form = ref({
  projectId: '',
  name: '',
  description: '',
});

const copyCommand = () => {
  void navigator.clipboard.writeText('npx @devicesdk/cli init');
  $q.notify({
    type: 'positive',
    message: 'Command copied to clipboard',
    position: 'top',
    timeout: 2000,
  });
};

const onSubmit = async () => {
  try {
    submitting.value = true;
    await projectService.create({
      project_slug: form.value.projectId,
      name: form.value.name || undefined,
      description: form.value.description || undefined,
    });

    $q.notify({
      type: 'positive',
      message: `Project "${form.value.projectId}" created successfully`,
      position: 'top',
    });

    emit('project-created');
    emit('update:modelValue', false);
    resetForm();
  } catch (error) {
    console.error('Project creation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create project';
    $q.notify({
      type: 'negative',
      message,
      position: 'top',
      timeout: 5000,
    });
  } finally {
    submitting.value = false;
  }
};

const resetForm = () => {
  form.value = { projectId: '', name: '', description: '' };
  step.value = 1;
};

watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) {
      resetForm();
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

.wizard-stepper {
  :deep(.q-stepper__header) {
    background: var(--background-secondary);
  }
}

.code-block {
  background: hsl(240, 10%, 10%);
  border-radius: var(--radius);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  display: flex;
  align-items: center;
  justify-content: space-between;

  code {
    color: hsl(160, 60%, 60%);
    font-size: 0.875rem;
  }

  .copy-btn {
    color: hsl(0, 0%, 70%);

    &:hover {
      color: white;
    }
  }
}

.create-btn {
  background: var(--primary) !important;
  color: var(--primary-foreground) !important;
  font-weight: 500;
}
</style>
