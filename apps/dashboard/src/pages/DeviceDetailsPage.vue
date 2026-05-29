<template>
  <q-page class="device-details-page q-pa-lg">
    <div class="row items-center q-mb-lg">
      <q-btn
        flat
        color="primary"
        icon="arrow_back"
        label="Back"
        :to="`/projects/${projectId}`"
        class="back-btn"
      />
      <q-breadcrumbs class="q-ml-md text-grey-7">
        <q-breadcrumbs-el icon="folder" to="/projects" />
        <q-breadcrumbs-el :label="projectId" :to="`/projects/${projectId}`" />
        <q-breadcrumbs-el :label="device?.name || deviceId" />
      </q-breadcrumbs>
    </div>

    <div v-if="loading" class="text-center q-pa-xl">
      <q-spinner-dots color="primary" size="50px" />
      <p class="q-mt-md text-grey-6">Loading device...</p>
    </div>

    <template v-else-if="device">
      <div class="q-mb-md">
        <div class="row items-center q-gutter-sm">
          <h1 class="page-title">{{ device.name || device.device_id }}</h1>
          <q-chip
            :color="isOnline ? 'positive' : 'grey-4'"
            :text-color="isOnline ? 'white' : 'grey-7'"
            size="sm"
          >
            {{ isOnline ? 'Online' : 'Offline' }}
          </q-chip>
        </div>
        <p class="page-subtitle font-mono">{{ device.device_id }}</p>
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
          <q-tab name="metrics" label="Metrics" icon="bar_chart" />
          <q-tab name="script" label="Script" icon="code" />
          <q-tab name="versions" label="Versions" icon="history" />
          <q-tab name="logs" label="Logs" icon="article" />
          <q-tab name="settings" label="Settings" icon="settings" />
        </q-tabs>

        <q-separator />

        <q-tab-panels v-model="activeTab" animated>
          <q-tab-panel name="overview" class="q-pa-lg">
            <div class="row q-col-gutter-lg">
              <div class="col-12 col-md-6">
                <div class="info-section">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Device Information</div>
                  <div class="info-row">
                    <span class="info-label">Slug</span>
                    <span class="info-value font-mono">{{ device.device_id }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Name</span>
                    <span class="info-value">{{ device.name || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Description</span>
                    <span class="info-value">{{ device.description || '—' }}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Status</span>
                    <q-chip
                      :color="isOnline ? 'positive' : 'grey-4'"
                      :text-color="isOnline ? 'white' : 'grey-7'"
                      size="sm"
                    >
                      {{ isOnline ? 'Online' : 'Offline' }}
                    </q-chip>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Last Connected</span>
                    <span class="info-value">
                      {{ device.last_connected_at ? formatDate(device.last_connected_at, { withTime: true }) : 'Never' }}
                    </span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Created</span>
                    <span class="info-value">{{ formatDate(device.created_at, { withTime: true }) }}</span>
                  </div>
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="info-section">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Current Script</div>
                  <div v-if="device.current_version_id" class="info-row">
                    <span class="info-label">Version ID</span>
                    <span class="info-value font-mono">{{ device.current_version_id }}</span>
                  </div>
                  <div v-else class="text-grey-6 text-center q-pa-lg">
                    <q-icon name="code_off" size="48px" class="q-mb-md" />
                    <div>No script deployed</div>
                  </div>
                </div>

                <div class="info-section q-mt-md">
                  <div class="text-subtitle2 text-weight-bold q-mb-md">Quick Actions</div>
                  <q-btn
                    outline
                    color="primary"
                    label="Upload Script"
                    icon="upload"
                    class="full-width q-mb-sm"
                    @click="activeTab = 'script'"
                  />
                  <q-btn
                    outline
                    color="grey-7"
                    label="Edit Device"
                    icon="edit"
                    class="full-width"
                    @click="showEditDialog = true"
                  />
                </div>
              </div>
            </div>
          </q-tab-panel>

          <q-tab-panel name="metrics" class="q-pa-lg">
            <DeviceMetricsPanel :project-id="projectId" :device-id="deviceId" />
          </q-tab-panel>

          <q-tab-panel name="script" class="q-pa-lg">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Script Editor</div>
              <q-select
                v-model="selectedTemplate"
                :options="scriptTemplates"
                label="Load Template"
                outlined
                dense
                emit-value
                map-options
                style="min-width: 200px"
                @update:model-value="loadTemplate"
              />
            </div>

            <div class="code-editor-container q-mb-md">
              <q-input
                v-model="scriptContent"
                type="textarea"
                outlined
                :rows="18"
                class="code-editor font-mono"
                placeholder="// Enter your device script here..."
              />
              <div :class="['text-caption q-mt-xs', isScriptTooLarge ? 'text-negative' : 'text-grey-6']">
                {{ scriptContent.length.toLocaleString() }} / 1,048,576 characters
                <span v-if="isScriptTooLarge" class="text-weight-bold"> - Script too large!</span>
              </div>
            </div>

            <div class="row items-center q-gutter-md">
              <q-input
                v-model="deployMessage"
                outlined
                dense
                label="Deployment message (optional)"
                class="col"
                maxlength="500"
              />
              <q-btn
                unelevated
                color="primary"
                label="Deploy Script"
                icon="rocket_launch"
                :loading="deploying"
                :disable="!scriptContent.trim() || isScriptTooLarge"
                @click="deployScript"
              />
            </div>
          </q-tab-panel>

          <q-tab-panel name="versions" class="q-pa-lg">
            <div class="text-subtitle1 text-weight-bold q-mb-lg">Version History</div>
            
            <q-table
              :rows="versions"
              :columns="versionColumns"
              row-key="version_id"
              flat
              :loading="loadingVersions"
              :rows-per-page-options="[10, 25, 50]"
            >
              <template #body="props">
                <q-tr :props="props">
                  <q-td key="version_id" :props="props">
                    <div class="row items-center">
                      <span class="font-mono">{{ props.row.version_id.slice(0, 8) }}...</span>
                      <q-chip
                        v-if="props.row.is_current"
                        color="primary"
                        text-color="white"
                        size="xs"
                        class="q-ml-sm"
                      >
                        Current
                      </q-chip>
                    </div>
                  </q-td>
                  <q-td key="message" :props="props">
                    {{ props.row.message || '—' }}
                  </q-td>
                  <q-td key="created_at" :props="props">
                    {{ formatDate(props.row.created_at, { withTime: true }) }}
                  </q-td>
                  <q-td key="actions" :props="props">
                    <q-btn
                      flat
                      dense
                      icon="visibility"
                      @click="viewVersion(props.row.version_id)"
                    >
                      <q-tooltip>View</q-tooltip>
                    </q-btn>
                    <q-btn
                      v-if="!props.row.is_current"
                      flat
                      dense
                      icon="restore"
                      color="primary"
                      @click="rollbackToVersion(props.row.version_id)"
                    >
                      <q-tooltip>Deploy this version</q-tooltip>
                    </q-btn>
                  </q-td>
                </q-tr>
              </template>

              <template #no-data>
                <div class="full-width text-center q-pa-xl">
                  <q-icon name="history" size="64px" color="grey-4" class="q-mb-md" />
                  <div class="text-h6 text-grey-6 q-mb-sm">No versions yet</div>
                  <p class="text-body2 text-grey-5">Deploy your first script to create a version</p>
                </div>
              </template>
            </q-table>
          </q-tab-panel>

          <q-tab-panel name="logs" class="q-pa-lg">
            <DeviceLogs :project-id="projectId" :device-id="deviceId" />
          </q-tab-panel>

          <q-tab-panel name="settings" class="q-pa-lg">
            <div class="settings-section q-mb-xl">
              <div class="text-subtitle1 text-weight-bold q-mb-md">Device Details</div>
              <q-form @submit="updateDevice">
                <q-input
                  v-model="editForm.name"
                  outlined
                  label="Device Name"
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
                      <div class="text-weight-medium">Delete Device</div>
                      <div class="text-caption text-grey-7">
                        Permanently delete this device and all its scripts
                      </div>
                    </div>
                    <q-btn
                      outline
                      color="negative"
                      label="Delete Device"
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

    <q-dialog v-model="showEditDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Edit Device</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="editForm.name" outlined label="Name" class="q-mb-md" />
          <q-input v-model="editForm.description" outlined label="Description" type="textarea" rows="3" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn unelevated color="primary" label="Save" :loading="saving" @click="updateDevice" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showDeleteDialog">
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
          <span class="text-h6">Delete Device</span>
        </q-card-section>
        <q-card-section>
          <p>Are you sure you want to delete <strong>{{ deviceId }}</strong>?</p>
          <p class="text-caption text-negative">This action cannot be undone.</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            flat
            color="negative"
            label="Delete"
            :loading="deleting"
            @click="deleteDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showVersionDialog" maximized>
      <q-card>
        <q-card-section class="row items-center">
          <div class="text-h6">Script Version: {{ viewingVersion?.version_id?.slice(0, 8) }}...</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section class="q-pa-none" style="height: calc(100vh - 100px); overflow: auto;">
          <pre class="q-pa-md font-mono" style="background: #1e1e1e; color: #d4d4d4; margin: 0; min-height: 100%;">{{ viewingVersion?.script }}</pre>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import DeviceLogs from '@/components/DeviceLogs.vue';
import DeviceMetricsPanel from '@/components/metrics/DeviceMetricsPanel.vue';
import { scriptTemplates, templateCode } from '@/lib/scriptTemplates';
import { formatDate, normalizeTimestamp } from '@/lib/time';
import {
  deviceService,
  scriptService,
  type Device,
  type ScriptVersion,
  type ScriptVersionDetail,
} from '@/services/api.service';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();

const projectId = ref(route.params.projectId as string);
const deviceId = ref(route.params.deviceId as string);
const device = ref<Device | null>(null);
const loading = ref(true);
const activeTab = ref('overview');
const saving = ref(false);
const deleting = ref(false);
const deploying = ref(false);

const showEditDialog = ref(false);
const showDeleteDialog = ref(false);
const showVersionDialog = ref(false);

const scriptContent = ref('');
const deployMessage = ref('');
const selectedTemplate = ref<string | null>(null);

const versions = ref<ScriptVersion[]>([]);
const loadingVersions = ref(false);
const viewingVersion = ref<ScriptVersionDetail | null>(null);

const editForm = ref({
  name: '',
  description: '',
});

const versionColumns = [
  { name: 'version_id', label: 'Version', field: 'version_id', align: 'left' as const },
  { name: 'message', label: 'Message', field: 'message', align: 'left' as const },
  { name: 'created_at', label: 'Created', field: 'created_at', align: 'left' as const },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' as const },
];

// Mirrors the canonical platform limit (@devicesdk/core MAX_SCRIPT_SIZE_BYTES =
// 1 MiB). Kept as a local literal on purpose: the dashboard has no
// @devicesdk/core dependency, and adding one to share a single number would
// pull a build-ordered package into the SPA (and break the no-build lint /
// component-test CI jobs).
const SCRIPT_MAX_LENGTH = 1024 * 1024;

const isScriptTooLarge = computed(() => scriptContent.value.length > SCRIPT_MAX_LENGTH);

const isOnline = computed(() => {
  if (!device.value?.last_connected_at) return false;
  const lastConnected = normalizeTimestamp(device.value.last_connected_at);
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return lastConnected > fiveMinutesAgo;
});

const loadTemplate = (templateKey: string | null) => {
  if (templateKey && templateCode[templateKey]) {
    scriptContent.value = templateCode[templateKey];
  }
};

const fetchDevice = async () => {
  try {
    loading.value = true;
    device.value = await deviceService.getById(projectId.value, deviceId.value);
    editForm.value = {
      name: device.value.name || '',
      description: device.value.description || '',
    };
  } catch (error) {
    console.error('Error fetching device:', error);
    $q.notify({ type: 'negative', message: 'Failed to load device', position: 'top' });
  } finally {
    loading.value = false;
  }
};

const fetchCurrentScript = async () => {
  try {
    const current = await scriptService.getCurrent(projectId.value, deviceId.value);
    scriptContent.value = current.script || '';
  } catch {
    // No script deployed yet, that's ok
  }
};

const versionsCached = ref(false);

const fetchVersions = async (force = false) => {
  if (versionsCached.value && !force) return;
  try {
    loadingVersions.value = true;
    versions.value = await scriptService.getVersions(projectId.value, deviceId.value);
    versionsCached.value = true;
  } catch (error) {
    console.error('Error fetching versions:', error);
  } finally {
    loadingVersions.value = false;
  }
};

const deployScript = async () => {
  if (isScriptTooLarge.value) {
    $q.notify({ type: 'negative', message: 'Script exceeds maximum size of 1MB', position: 'top' });
    return;
  }
  try {
    deploying.value = true;
    await scriptService.upload(projectId.value, deviceId.value, {
      script: scriptContent.value,
      message: deployMessage.value || undefined,
    });
    $q.notify({ type: 'positive', message: 'Script deployed successfully', position: 'top' });
    deployMessage.value = '';
    versionsCached.value = false;
    await fetchDevice();
    await fetchVersions(true);
  } catch (error) {
    console.error('Error deploying script:', error);
    const message = error instanceof Error ? error.message : 'Failed to deploy script';
    $q.notify({ type: 'negative', message, position: 'top' });
  } finally {
    deploying.value = false;
  }
};

const viewVersion = async (versionId: string) => {
  try {
    viewingVersion.value = await scriptService.getVersion(projectId.value, deviceId.value, versionId);
    showVersionDialog.value = true;
  } catch (error) {
    console.error('Error fetching version:', error);
    $q.notify({ type: 'negative', message: 'Failed to load version', position: 'top' });
  }
};

const rollbackToVersion = async (versionId: string) => {
  try {
    await scriptService.deployVersion(projectId.value, deviceId.value, versionId);
    $q.notify({ type: 'positive', message: 'Version deployed successfully', position: 'top' });
    versionsCached.value = false;
    await fetchDevice();
    await fetchVersions(true);
    await fetchCurrentScript();
  } catch (error) {
    console.error('Error deploying version:', error);
    $q.notify({ type: 'negative', message: 'Failed to deploy version', position: 'top' });
  }
};

const updateDevice = async () => {
  try {
    saving.value = true;
    await deviceService.update(projectId.value, deviceId.value, {
      name: editForm.value.name || undefined,
      description: editForm.value.description || undefined,
    });
    $q.notify({ type: 'positive', message: 'Device updated', position: 'top' });
    showEditDialog.value = false;
    await fetchDevice();
  } catch (error) {
    console.error('Error updating device:', error);
    $q.notify({ type: 'negative', message: 'Failed to update device', position: 'top' });
  } finally {
    saving.value = false;
  }
};

const deleteDevice = async () => {
  try {
    deleting.value = true;
    await deviceService.delete(projectId.value, deviceId.value);
    $q.notify({ type: 'positive', message: 'Device deleted', position: 'top' });
    void router.push(`/projects/${projectId.value}`);
  } catch (error) {
    console.error('Error deleting device:', error);
    $q.notify({ type: 'negative', message: 'Failed to delete device', position: 'top' });
  } finally {
    deleting.value = false;
  }
};

watch(activeTab, (tab) => {
  if (tab === 'script' && !scriptContent.value) {
    void fetchCurrentScript();
  }
  if (tab === 'versions') {
    void fetchVersions();
  }
});

watch(() => route.params, (newParams) => {
  if (newParams.projectId && newParams.deviceId) {
    projectId.value = newParams.projectId as string;
    deviceId.value = newParams.deviceId as string;
    versionsCached.value = false;
    void fetchDevice();
  }
});

onMounted(() => {
  void fetchDevice();
});
</script>

<style scoped lang="scss">
.device-details-page {
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

.code-editor {
  :deep(.q-field__control) {
    border-radius: var(--radius);
    overflow: hidden;
  }
  
  :deep(textarea) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
    background: hsl(240, 10%, 10%);
    color: hsl(0, 0%, 90%);
    padding: 1rem;
  }
}
</style>
