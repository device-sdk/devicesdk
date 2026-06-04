<template>
  <q-page class="project-details-page q-pa-lg">
    <div class="row items-center q-mb-lg">
      <q-btn
        flat
        color="primary"
        icon="arrow_back"
        label="Projects"
        to="/projects"
        class="back-btn"
      />
      <q-breadcrumbs class="q-ml-md text-grey-7">
        <q-breadcrumbs-el label="Projects" icon="folder" aria-label="Projects" to="/projects" />
        <q-breadcrumbs-el :label="project?.name || projectId" />
      </q-breadcrumbs>
    </div>

    <div v-if="loading" class="text-center q-pa-xl">
      <q-spinner-dots color="primary" size="50px" />
      <p class="q-mt-md text-grey-6">Loading project...</p>
    </div>

    <div v-else-if="loadError" class="text-center q-pa-xl">
      <q-icon name="error_outline" size="56px" color="negative" class="q-mb-md" />
      <div class="text-h6 text-grey-7 q-mb-sm">Couldn't load this project</div>
      <p class="text-body2 text-grey-6 q-mb-lg">{{ loadError }}</p>
      <div class="row q-gutter-sm justify-center">
        <q-btn unelevated color="primary" label="Retry" icon="refresh" @click="fetchProject" />
        <q-btn flat color="grey-7" label="Back to Projects" to="/projects" />
      </div>
    </div>

    <template v-else-if="project">
      <div class="q-mb-md">
        <h1 class="page-title">{{ project.name || project.project_slug }}</h1>
        <p class="page-subtitle font-mono">{{ project.project_slug }}</p>
      </div>

      <q-card class="modern-card" flat bordered>
        <q-tabs
          v-model="activeTab"
          class="text-grey-8"
          active-color="primary"
          indicator-color="primary"
          align="left"
        >
          <q-tab name="overview" label="Overview" icon="info" />
          <q-tab name="analytics" label="Analytics" icon="bar_chart" />
          <q-tab name="devices" label="Devices" icon="memory" />
          <q-tab name="settings" label="Settings" icon="settings" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="activeTab" animated>
          <q-tab-panel name="overview" class="q-pa-lg">
            <div class="row q-col-gutter-lg">
              <div class="col-12 col-md-6">
                <div class="stat-card">
                  <q-icon name="memory" size="32px" color="primary" />
                  <div class="stat-value">{{ project.device_count || 0 }}</div>
                  <div class="stat-label">Total Devices</div>
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="stat-card">
                  <q-icon name="wifi" size="32px" color="positive" />
                  <div class="stat-value">{{ onlineDevices }}</div>
                  <div class="stat-label">Online Devices</div>
                </div>
              </div>
            </div>

            <q-separator class="q-my-lg" />

            <div class="row q-col-gutter-lg">
              <div class="col-12 col-md-6">
                <div class="info-section">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Project Information</div>
                  <div class="info-row">
                    <span class="info-label">Slug</span>
                    <span class="info-value font-mono">{{ project.project_slug }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Name</span>
                    <span class="info-value">{{ project.name || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Description</span>
                    <span class="info-value">{{ project.description || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Created</span>
                    <span class="info-value">{{ formatDate(project.created_at, { withTime: true }) }}</span>
                  </div>
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="info-section">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Quick Actions</div>
                  <q-btn
                    outline
                    color="primary"
                    label="Add Device"
                    icon="add"
                    class="full-width q-mb-sm"
                    @click="showAddDeviceDialog = true"
                  />
                  <q-btn
                    outline
                    color="grey-7"
                    label="Edit Project"
                    icon="edit"
                    class="full-width"
                    @click="activeTab = 'settings'"
                  />
                </div>
              </div>
            </div>
          </q-tab-panel>

          <q-tab-panel name="analytics" class="q-pa-lg">
            <ProjectMetricsPanel :project-id="projectId" />
          </q-tab-panel>

          <q-tab-panel name="devices" class="q-pa-lg">
            <div class="row items-center justify-between q-mb-lg">
              <div class="text-subtitle1 text-weight-bold">Devices ({{ project.device_count || 0 }})</div>
              <q-btn
                unelevated
                color="primary"
                label="Add Device"
                icon="add"
                @click="showAddDeviceDialog = true"
              />
            </div>

            <q-table
              :rows="project.devices || []"
              :columns="deviceColumns"
              row-key="device_id"
              flat
              :rows-per-page-options="[10, 25, 50]"
            >
              <template #body="props">
                <q-tr
                  :props="props"
                  class="cursor-pointer"
                  tabindex="0"
                  :aria-label="`Open device ${props.row.name || props.row.device_id}`"
                  @click="openDevice(props.row.device_id)"
                  @keydown.enter="openDevice(props.row.device_id)"
                  @keydown.space.prevent="openDevice(props.row.device_id)"
                >
                  <q-td key="device_id" :props="props">
                    <div class="row items-center">
                      <q-icon name="memory" color="primary" size="20px" class="q-mr-sm" />
                      <div>
                        <div class="text-weight-medium">{{ props.row.name || props.row.device_id }}</div>
                        <div class="text-caption text-grey-6 font-mono">{{ props.row.device_id }}</div>
                      </div>
                    </div>
                  </q-td>
                  <q-td key="status" :props="props">
                    <q-chip
                      :color="props.row.status === 'online' ? 'positive' : 'grey-4'"
                      :text-color="props.row.status === 'online' ? 'white' : 'grey-7'"
                      size="sm"
                      :icon="props.row.status === 'online' ? 'wifi' : 'wifi_off'"
                    >
                      {{ props.row.status }}
                    </q-chip>
                  </q-td>
                  <q-td key="last_connected_at" :props="props">
                    {{ props.row.last_connected_at ? formatDate(props.row.last_connected_at, { withTime: true }) : 'Never' }}
                  </q-td>
                  <q-td key="actions" :props="props">
                    <q-btn flat round dense icon="chevron_right" @click.stop="openDevice(props.row.device_id)" />
                  </q-td>
                </q-tr>
              </template>

              <template #no-data>
                <div class="full-width text-center q-pa-xl">
                  <q-icon name="memory" size="64px" color="grey-4" class="q-mb-md" />
                  <div class="text-h6 text-grey-6 q-mb-sm">No devices yet</div>
                  <p class="text-body2 text-grey-5 q-mb-lg">Add your first device to get started</p>
                  <q-btn
                    unelevated
                    color="primary"
                    label="Add Device"
                    icon="add"
                    @click="showAddDeviceDialog = true"
                  />
                </div>
              </template>
            </q-table>
          </q-tab-panel>

          <q-tab-panel name="settings" class="q-pa-lg">
            <div class="settings-section q-mb-xl">
              <div class="text-subtitle1 text-weight-bold q-mb-md">Project Details</div>
              <q-form @submit="updateProject">
                <q-input
                  v-model="editForm.name"
                  outlined
                  label="Project Name"
                  class="q-mb-md"
                />
                <q-input
                  v-model="editForm.description"
                  outlined
                  label="Description"
                  type="textarea"
                  rows="3"
                  class="q-mb-md"
                />
                <q-btn
                  unelevated
                  color="primary"
                  label="Save Changes"
                  type="submit"
                  :loading="saving"
                />
              </q-form>
            </div>

            <q-separator class="q-my-lg" />

            <div class="danger-zone">
              <div class="text-subtitle1 text-weight-bold text-negative q-mb-md">Danger Zone</div>
              <q-card flat bordered class="bg-red-1">
                <q-card-section>
                  <div class="row items-center justify-between">
                    <div>
                      <div class="text-weight-medium">Delete Project</div>
                      <div class="text-caption text-grey-7">
                        Permanently delete this project and all its devices
                      </div>
                    </div>
                    <q-btn
                      outline
                      color="negative"
                      label="Delete Project"
                      @click="showDeleteDialog = true"
                    />
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </template>

    <CreateDeviceDialog
      v-model="showAddDeviceDialog"
      :project-id="projectId"
      @device-created="fetchProject"
    />

    <q-dialog v-model="showDeleteDialog">
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
          <span class="text-h6">Delete Project</span>
        </q-card-section>
        <q-card-section>
          <p>Type <strong>{{ projectId }}</strong> to confirm deletion:</p>
          <q-input v-model="deleteConfirmation" outlined dense placeholder="Project slug" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            flat
            color="negative"
            label="Delete"
            :disable="deleteConfirmation !== projectId"
            :loading="deleting"
            @click="deleteProject"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { projectService, type Project } from '@/services/api.service';
import { formatDate } from '@/lib/time';
import CreateDeviceDialog from '@/components/CreateDeviceDialog.vue';
import ProjectMetricsPanel from '@/components/metrics/ProjectMetricsPanel.vue';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();

const projectId = ref(route.params.projectId as string);
const project = ref<Project | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const activeTab = ref('overview');
const saving = ref(false);
const deleting = ref(false);

const showAddDeviceDialog = ref(false);
const showDeleteDialog = ref(false);
const deleteConfirmation = ref('');

const editForm = ref({
  name: '',
  description: '',
});

const deviceColumns = [
  { name: 'device_id', label: 'Device', field: 'device_id', align: 'left' as const },
  { name: 'status', label: 'Status', field: 'status', align: 'center' as const },
  { name: 'last_connected_at', label: 'Last Connected', field: 'last_connected_at', align: 'left' as const },
  { name: 'actions', label: '', field: 'actions', align: 'right' as const },
];

const onlineDevices = computed(() => {
  return project.value?.devices?.filter(d => d.status === 'online').length || 0;
});

// Cancels an in-flight fetch when the user navigates to another project, so a
// slow earlier response can't overwrite the newer one.
let fetchController: AbortController | null = null;

const fetchProject = async () => {
  fetchController?.abort();
  const controller = new AbortController();
  fetchController = controller;
  try {
    loading.value = true;
    loadError.value = null;
    project.value = await projectService.getById(projectId.value, controller.signal);
    editForm.value = {
      name: project.value.name || '',
      description: project.value.description || '',
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('Error fetching project:', error);
    loadError.value = error instanceof Error ? error.message : 'Failed to load project';
  } finally {
    if (fetchController === controller) {
      loading.value = false;
      fetchController = null;
    }
  }
};

const updateProject = async () => {
  try {
    saving.value = true;
    await projectService.update(projectId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
    });
    $q.notify({ type: 'positive', message: 'Project updated', position: 'top' });
    await fetchProject();
  } catch (error) {
    console.error('Error updating project:', error);
    const message = error instanceof Error ? error.message : 'Failed to update project';
    $q.notify({ type: 'negative', message, position: 'top' });
  } finally {
    saving.value = false;
  }
};

const deleteProject = async () => {
  try {
    deleting.value = true;
    await projectService.delete(projectId.value);
    $q.notify({ type: 'positive', message: 'Project deleted', position: 'top' });
    void router.push('/projects');
  } catch (error) {
    console.error('Error deleting project:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete project';
    $q.notify({ type: 'negative', message, position: 'top' });
  } finally {
    deleting.value = false;
  }
};

const openDevice = (deviceId: string) => {
  void router.push(`/projects/${projectId.value}/devices/${deviceId}`);
};

watch(() => route.params.projectId, (newId) => {
  if (newId) {
    projectId.value = newId as string;
    void fetchProject();
  }
});

onMounted(() => {
  void fetchProject();
});

onUnmounted(() => {
  fetchController?.abort();
});
</script>

<style scoped lang="scss">
.project-details-page {
  background: var(--background-secondary);
  min-height: 100vh;
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
</style>
