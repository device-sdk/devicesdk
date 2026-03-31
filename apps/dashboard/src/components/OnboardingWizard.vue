<template>
  <div class="onboarding-wrapper">
    <q-stepper
      v-model="currentStep"
      flat
      animated
      class="onboarding-stepper"
      header-nav
    >
      <q-step :name="1" title="Welcome" icon="waving_hand" :done="currentStep > 1">
        <div class="step-content text-center">
          <q-icon name="developer_board" size="80px" class="step-hero-icon q-mb-lg" />
          <h2 class="step-title">Welcome to DeviceSDK!</h2>
          <p class="step-body">
            Let's set up your first project. You'll be building IoT devices with TypeScript in minutes.
          </p>
          <div class="step-actions">
            <q-btn
              unelevated
              color="primary"
              label="Get Started"
              icon-right="arrow_forward"
              class="action-btn"
              @click="currentStep = 2"
            />
          </div>
        </div>
      </q-step>

      <q-step :name="2" title="Install CLI" icon="terminal" :done="currentStep > 2">
        <div class="step-content">
          <h2 class="step-title">Install the CLI</h2>
          <p class="step-body">
            The CLI is how you'll build, deploy, and flash firmware to your devices.
          </p>

          <div class="code-block q-mb-md">
            <div class="code-line">
              <span class="code-prompt">$</span>
              <code>npm install -g @devicesdk/cli</code>
            </div>
            <q-btn
              flat
              dense
              icon="content_copy"
              size="sm"
              class="copy-btn"
              @click="copyToClipboard('npm install -g @devicesdk/cli')"
            >
              <q-tooltip>Copy to clipboard</q-tooltip>
            </q-btn>
          </div>

          <div class="code-block q-mb-lg">
            <div class="code-line">
              <span class="code-prompt">$</span>
              <code>devicesdk login</code>
            </div>
            <q-btn
              flat
              dense
              icon="content_copy"
              size="sm"
              class="copy-btn"
              @click="copyToClipboard('devicesdk login')"
            >
              <q-tooltip>Copy to clipboard</q-tooltip>
            </q-btn>
          </div>

          <p class="text-caption text-grey-6">
            This authenticates the CLI with your DeviceSDK account so you can deploy scripts and flash devices.
          </p>

          <div class="step-actions">
            <q-btn flat label="Back" class="q-mr-sm" @click="currentStep = 1" />
            <q-btn
              unelevated
              color="primary"
              label="Next"
              icon-right="arrow_forward"
              class="action-btn"
              @click="currentStep = 3"
            />
          </div>
        </div>
      </q-step>

      <q-step :name="3" title="Create Project" icon="folder" :done="currentStep > 3">
        <div class="step-content">
          <h2 class="step-title">Create a Project</h2>
          <p class="step-body q-mb-lg">
            A project groups your devices, scripts, and configuration together.
          </p>

          <q-banner v-if="createError" class="bg-negative text-white q-mb-md" rounded>
            <template #avatar>
              <q-icon name="error" />
            </template>
            {{ createError }}
          </q-banner>

          <q-form @submit="onCreateProject" class="project-form">
            <div class="q-mb-md">
              <div class="field-label">
                <q-icon name="badge" class="q-mr-xs" /> Project Slug
                <span class="text-negative">*</span>
              </div>
              <q-input
                v-model="form.projectSlug"
                outlined
                placeholder="e.g., smart-home-hub"
                :rules="[
                  (val: string) => !!val || 'Project slug is required',
                  (val: string) => (val.length >= 1 && val.length <= 36) || 'Must be 1-36 characters',
                  (val: string) => /^[a-z][a-z0-9-]*$/.test(val) || 'Must start with a letter, only lowercase letters, numbers, and hyphens',
                ]"
                class="font-mono"
              >
                <template #prepend>
                  <q-icon name="folder" color="primary" />
                </template>
              </q-input>
              <div class="text-caption text-grey-6 q-mt-xs q-ml-sm">URL-safe identifier (e.g., my-iot-project)</div>
            </div>

            <div class="q-mb-md">
              <div class="field-label">
                <q-icon name="label" class="q-mr-xs" /> Name
                <span class="text-grey-5">(optional)</span>
              </div>
              <q-input
                v-model="form.name"
                outlined
                placeholder="e.g., Smart Home Hub"
                maxlength="100"
              >
                <template #prepend>
                  <q-icon name="text_fields" color="grey-6" />
                </template>
              </q-input>
            </div>

            <div class="q-mb-lg">
              <div class="field-label">
                <q-icon name="description" class="q-mr-xs" /> Description
                <span class="text-grey-5">(optional)</span>
              </div>
              <q-input
                v-model="form.description"
                outlined
                type="textarea"
                rows="2"
                placeholder="Describe your project..."
                maxlength="500"
              />
            </div>

            <div class="step-actions">
              <q-btn flat label="Back" class="q-mr-sm" @click="currentStep = 2" />
              <q-btn
                unelevated
                color="primary"
                label="Create Project"
                icon-right="add_circle"
                type="submit"
                :loading="creating"
                class="action-btn"
              />
            </div>
          </q-form>
        </div>
      </q-step>

      <q-step :name="4" title="Next Steps" icon="check_circle">
        <div class="step-content text-center">
          <q-icon name="check_circle" size="80px" class="step-success-icon q-mb-lg" />
          <h2 class="step-title">You're all set!</h2>
          <p class="step-body q-mb-lg">
            Your project is ready. Here's what you can do next:
          </p>

          <div class="next-steps-grid">
            <div class="next-step-card">
              <q-icon name="devices" size="28px" color="primary" class="q-mb-sm" />
              <div class="next-step-title">Create a device</div>
              <div class="next-step-desc font-mono">devicesdk init</div>
            </div>
            <div class="next-step-card">
              <q-icon name="cloud_upload" size="28px" color="primary" class="q-mb-sm" />
              <div class="next-step-title">Deploy scripts</div>
              <div class="next-step-desc font-mono">devicesdk deploy</div>
            </div>
            <div class="next-step-card">
              <q-icon name="memory" size="28px" color="primary" class="q-mb-sm" />
              <div class="next-step-title">Flash firmware</div>
              <div class="next-step-desc font-mono">devicesdk flash</div>
            </div>
            <a
              href="https://devicesdk.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              class="next-step-card next-step-link"
            >
              <q-icon name="menu_book" size="28px" color="primary" class="q-mb-sm" />
              <div class="next-step-title">Full documentation</div>
              <div class="next-step-desc">devicesdk.com/docs</div>
            </a>
          </div>

          <div class="step-actions q-mt-lg">
            <q-btn
              unelevated
              color="primary"
              label="Go to Project"
              icon-right="arrow_forward"
              class="action-btn"
              @click="goToProject"
            />
          </div>
        </div>
      </q-step>
    </q-stepper>

    <div class="skip-container">
      <q-btn
        flat
        dense
        label="Skip onboarding"
        class="skip-btn"
        icon="close"
        @click="$emit('skip')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { projectService, type Project } from '@/services/api.service';

const emit = defineEmits<{
  skip: [];
  'project-created': [project: Project];
}>();

const router = useRouter();
const $q = useQuasar();

const currentStep = ref(1);
const creating = ref(false);
const createError = ref('');
const createdProject = ref<Project | null>(null);

const form = ref({
  projectSlug: '',
  name: '',
  description: '',
});

const copyToClipboard = (text: string) => {
  void navigator.clipboard.writeText(text);
  $q.notify({
    type: 'positive',
    message: 'Copied to clipboard',
    position: 'top',
    timeout: 2000,
  });
};

const onCreateProject = async () => {
  createError.value = '';
  try {
    creating.value = true;
    const project = await projectService.create({
      project_slug: form.value.projectSlug,
      name: form.value.name || undefined,
      description: form.value.description || undefined,
    });
    createdProject.value = project;
    emit('project-created', project);
    currentStep.value = 4;
  } catch (error) {
    console.error('Project creation error:', error);
    createError.value = error instanceof Error ? error.message : 'Failed to create project';
  } finally {
    creating.value = false;
  }
};

const goToProject = () => {
  if (createdProject.value) {
    void router.push(`/projects/${createdProject.value.project_slug}`);
  }
};
</script>

<style scoped lang="scss">
.onboarding-wrapper {
  max-width: 700px;
  margin: 2rem auto;
  position: relative;
}

.onboarding-stepper {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow);

  :deep(.q-stepper__header) {
    background: var(--background-secondary);
    border-bottom: 1px solid var(--border);
  }
}

.step-content {
  padding: 1.5rem 1rem;
}

.step-title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--foreground);
  margin: 0 0 0.75rem;
}

.step-body {
  font-size: 0.9375rem;
  color: var(--foreground-muted);
  line-height: 1.6;
  margin: 0 0 1.5rem;
}

.step-hero-icon {
  color: var(--primary);
  opacity: 0.8;
}

.step-success-icon {
  color: var(--success);
}

.step-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 1rem;
}

.action-btn {
  background: var(--primary) !important;
  color: var(--primary-foreground) !important;
  font-weight: 500;
  padding: 0.5rem 1.25rem;
}

// Code blocks
.code-block {
  background: hsl(240, 10%, 10%);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.code-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.code-prompt {
  color: hsl(0, 0%, 50%);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.875rem;
  user-select: none;
}

.code-block code {
  color: hsl(160, 60%, 60%);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.875rem;
}

.copy-btn {
  color: hsl(0, 0%, 70%);

  &:hover {
    color: white;
  }
}

// Form fields
.field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
  margin-bottom: 0.375rem;
}

.project-form {
  text-align: left;
}

// Next steps grid
.next-steps-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  text-align: center;
}

.next-step-card {
  background: var(--background-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.next-step-link {
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: hsl(240, 6%, 70%);
  }
}

.next-step-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
  margin-bottom: 0.25rem;
}

.next-step-desc {
  font-size: 0.75rem;
  color: var(--foreground-muted);
}

// Skip button
.skip-container {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
}

.skip-btn {
  color: var(--foreground-muted);
  font-size: 0.8125rem;

  &:hover {
    color: var(--foreground);
  }
}

@media (max-width: 600px) {
  .next-steps-grid {
    grid-template-columns: 1fr;
  }
}
</style>
