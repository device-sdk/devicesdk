<template>
  <q-page class="projects-page q-pa-lg">
    <OnboardingWizard
      v-if="showOnboarding"
      @skip="completeOnboarding"
      @project-created="onOnboardingProjectCreated"
    />

    <template v-else>
      <div class="page-header q-mb-md">
        <div>
          <h1 class="q-my-none page-title">Projects</h1>
          <p class="page-subtitle q-mb-none">Manage and monitor your IoT projects</p>
        </div>
        <q-btn
          unelevated
          color="primary"
          label="Create Project"
          icon="add"
          class="create-btn"
          @click="showCreateDialog = true"
        />
      </div>

      <q-card class="modern-card" flat bordered>
        <q-card-section class="q-pb-none">
          <div class="row items-center q-gutter-md">
            <q-input
              v-model="searchQuery"
              outlined
              dense
              placeholder="Search projects..."
              class="search-input"
              clearable
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
        </q-card-section>

        <q-card-section class="q-pa-none q-mt-md">
          <q-table
            :rows="filteredProjects"
            :columns="columns"
            row-key="id"
            :loading="loading"
            flat
            :rows-per-page-options="[10, 25, 50]"
            class="modern-table"
          >
            <template #header="props">
              <q-tr :props="props" class="table-header">
                <q-th
                  v-for="col in props.cols"
                  :key="col.name"
                  :props="props"
                  class="text-weight-bold"
                >
                  {{ col.label }}
                </q-th>
              </q-tr>
            </template>

            <template #body="props">
              <q-tr :props="props" class="table-row" @click="openProject(props.row.project_slug)" style="cursor: pointer">
                <q-td key="project_slug" :props="props">
                  <div class="row items-center">
                    <q-icon name="folder" color="primary" size="24px" class="q-mr-sm" />
                    <div>
                      <div class="text-weight-medium">{{ props.row.name || props.row.project_slug }}</div>
                      <div class="text-caption text-grey-6 font-mono">{{ props.row.project_slug }}</div>
                    </div>
                  </div>
                </q-td>
                <q-td key="description" :props="props">
                  <span class="text-grey-8">{{ props.row.description || '—' }}</span>
                </q-td>
                <q-td key="device_count" :props="props">
                  <q-chip
                    :color="(props.row.device_count || 0) > 0 ? 'primary' : 'grey-4'"
                    :text-color="(props.row.device_count || 0) > 0 ? 'white' : 'grey-7'"
                    size="sm"
                    icon="memory"
                  >
                    {{ props.row.device_count || 0 }} devices
                  </q-chip>
                </q-td>
                <q-td key="created_at" :props="props">
                  <div class="text-grey-8">
                    {{ formatDate(props.row.created_at) }}
                  </div>
                </q-td>
                <q-td key="actions" :props="props">
                  <q-btn
                    flat
                    round
                    dense
                    icon="more_vert"
                    @click.stop
                  >
                    <q-menu>
                      <q-list style="min-width: 150px">
                        <q-item clickable v-close-popup @click="openProject(props.row.project_slug)">
                          <q-item-section avatar>
                            <q-icon name="open_in_new" />
                          </q-item-section>
                          <q-item-section>Open</q-item-section>
                        </q-item>
                        <q-item clickable v-close-popup @click="confirmDelete(props.row)">
                          <q-item-section avatar>
                            <q-icon name="delete" color="negative" />
                          </q-item-section>
                          <q-item-section class="text-negative">Delete</q-item-section>
                        </q-item>
                      </q-list>
                    </q-menu>
                  </q-btn>
                </q-td>
              </q-tr>
            </template>

            <template #no-data>
              <div class="full-width row flex-center q-pa-xl text-grey-7">
                <div class="text-center empty-state">
                  <q-icon name="folder_open" size="80px" class="q-mb-md empty-icon" />
                  <div class="text-h6 text-weight-medium q-mb-sm">No projects yet</div>
                  <p class="text-body2 q-mb-lg">Create your first project to get started with DeviceSDK</p>
                  <q-btn
                    unelevated
                    color="primary"
                    label="Create Project"
                    icon="add"
                    class="create-btn"
                    @click="showCreateDialog = true"
                  />
                </div>
              </div>
            </template>

            <template #loading>
              <div class="q-pa-md">
                <q-linear-progress indeterminate color="primary" class="loading-bar" />
              </div>
            </template>
          </q-table>
        </q-card-section>
      </q-card>

      <CreateProjectDialog
        v-model="showCreateDialog"
        @project-created="fetchProjects"
      />

      <q-dialog v-model="showDeleteDialog">
        <q-card style="min-width: 400px">
          <q-card-section class="row items-center">
            <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
            <span class="text-h6">Delete Project</span>
          </q-card-section>
          <q-card-section>
            <p>Are you sure you want to delete <strong>{{ projectToDelete?.project_slug }}</strong>?</p>
            <p class="text-caption text-negative">This action cannot be undone. All devices and scripts will be permanently deleted.</p>
            <q-input
              v-model="deleteConfirmation"
              outlined
              dense
              :placeholder="`Type '${projectToDelete?.project_slug}' to confirm`"
              class="q-mt-md"
            />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat label="Cancel" v-close-popup />
            <q-btn
              flat
              label="Delete"
              color="negative"
              :disable="deleteConfirmation !== projectToDelete?.project_slug"
              :loading="deleting"
              @click="deleteProject"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { projectService, userService, type Project } from '@/services/api.service';
import { useAuth } from '@/composables/useAuth';
import CreateProjectDialog from '@/components/CreateProjectDialog.vue';
import OnboardingWizard from '@/components/OnboardingWizard.vue';

const router = useRouter();
const $q = useQuasar();
const auth = useAuth();
const projects = ref<Project[]>([]);
const loading = ref(false);
const showCreateDialog = ref(false);
const searchQuery = ref('');

const showOnboarding = computed(() => {
  return !loading.value && projects.value.length === 0 && auth.user?.onboarding_completed === 0;
});

const completeOnboarding = async () => {
  await userService.completeOnboarding();
  await auth.fetchUser();
  void fetchProjects();
};

const onOnboardingProjectCreated = async () => {
  await userService.completeOnboarding();
  await auth.fetchUser();
  void fetchProjects();
};

const showDeleteDialog = ref(false);
const projectToDelete = ref<Project | null>(null);
const deleteConfirmation = ref('');
const deleting = ref(false);

const columns = [
  {
    name: 'project_slug',
    label: 'Project',
    field: 'project_slug',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'description',
    label: 'Description',
    field: 'description',
    align: 'left' as const,
  },
  {
    name: 'device_count',
    label: 'Devices',
    field: 'device_count',
    align: 'center' as const,
    sortable: true,
  },
  {
    name: 'created_at',
    label: 'Created',
    field: 'created_at',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'actions',
    label: '',
    field: 'actions',
    align: 'right' as const,
  },
];

const filteredProjects = computed(() => {
  if (!searchQuery.value) return projects.value;
  const query = searchQuery.value.toLowerCase();
  return projects.value.filter(
    (p) =>
      p.project_slug.toLowerCase().includes(query) ||
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.description && p.description.toLowerCase().includes(query))
  );
});

const normalizeTimestamp = (timestamp: number): number => {
  // API may return seconds or milliseconds - normalize to milliseconds
  return timestamp < 946684800000 ? timestamp * 1000 : timestamp;
};

const formatDate = (timestamp: number) => {
  const normalized = normalizeTimestamp(timestamp);
  return new Date(normalized).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const fetchProjects = async () => {
  try {
    loading.value = true;
    projects.value = await projectService.getAll();
  } catch (error) {
    console.error('Error fetching projects:', error);
    $q.notify({
      type: 'negative',
      message: 'Failed to load projects',
      position: 'top',
    });
  } finally {
    loading.value = false;
  }
};

const openProject = (projectSlug: string) => {
  void router.push(`/projects/${projectSlug}`);
};

const confirmDelete = (project: Project) => {
  projectToDelete.value = project;
  deleteConfirmation.value = '';
  showDeleteDialog.value = true;
};

const deleteProject = async () => {
  if (!projectToDelete.value) return;
  try {
    deleting.value = true;
    await projectService.delete(projectToDelete.value.project_slug);
    $q.notify({
      type: 'positive',
      message: `Project "${projectToDelete.value.project_slug}" deleted`,
      position: 'top',
    });
    showDeleteDialog.value = false;
    await fetchProjects();
  } catch (error) {
    console.error('Error deleting project:', error);
    $q.notify({
      type: 'negative',
      message: 'Failed to delete project',
      position: 'top',
    });
  } finally {
    deleting.value = false;
  }
};

onMounted(() => {
  void fetchProjects();
});
</script>

<style scoped lang="scss">
.projects-page {
  background: var(--background-secondary);
  min-height: 100vh;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--foreground);
  margin: 0;
}

.page-subtitle {
  font-size: 0.875rem;
  color: var(--foreground-muted);
  margin: 0.25rem 0 0;
}

.create-btn {
  background: var(--primary) !important;
  color: var(--primary-foreground) !important;
  font-weight: 500;
  padding: 0.5rem 1rem;

  &:hover {
    opacity: 0.9;
  }
}

.search-input {
  max-width: 320px;

  :deep(.q-field__control) {
    background: var(--background);
  }
}

.table-row {
  cursor: pointer;
}

.empty-state {
  padding: 4rem 2rem;
}

.empty-icon {
  opacity: 0.2;
}
</style>
