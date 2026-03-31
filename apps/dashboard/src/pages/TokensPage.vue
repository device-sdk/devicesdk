<template>
  <q-page class="tokens-page q-pa-lg">
    <div class="page-header q-mb-md">
      <div>
        <h1 class="page-title">API Tokens</h1>
        <p class="page-subtitle">Manage API tokens for programmatic access</p>
      </div>
      <q-btn
        unelevated
        color="primary"
        label="Create Token"
        icon="add"
        class="create-btn"
        @click="showCreateDialog = true"
      />
    </div>

    <q-card class="modern-card" flat bordered>
      <q-card-section class="q-pa-none">
        <q-table
          :rows="tokens"
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
            <q-tr :props="props" class="table-row">
              <q-td key="id" :props="props">
                <div class="row items-center">
                  <q-icon name="vpn_key" color="primary" size="20px" class="q-mr-sm" />
                  <div>
                    <div class="text-weight-medium">{{ props.row.id }}</div>
                    <div class="text-caption text-grey-6" v-if="props.row.description">
                      {{ props.row.description }}
                    </div>
                  </div>
                </div>
              </q-td>
              <q-td key="description" :props="props">
                <span class="text-grey-8">{{ props.row.description || '—' }}</span>
              </q-td>
              <q-td key="managed" :props="props">
                <q-chip
                  dense
                  square
                  color="grey-2"
                  text-color="grey-8"
                  v-if="props.row.managed !== undefined"
                >
                  <q-icon
                    :name="props.row.managed ? 'shield' : 'person'"
                    size="16px"
                    class="q-mr-xs"
                  />
                  {{ props.row.managed ? 'Managed' : 'User' }}
                </q-chip>
                <span v-else class="text-grey-6">Unknown</span>
              </q-td>
              <q-td key="last_four" :props="props">
                <q-chip
                  dense
                  square
                  class="token-chip"
                >
                  <span class="font-mono">****{{ props.row.last_four }}</span>
                </q-chip>
              </q-td>
              <q-td key="created_at" :props="props">
                <div class="text-grey-8">
                  {{ new Date(props.row.created_at).toLocaleDateString() }}
                </div>
                <div class="text-caption text-grey-6">
                  {{ new Date(props.row.created_at).toLocaleTimeString() }}
                </div>
              </q-td>
              <q-td key="actions" :props="props">
                <q-btn
                  unelevated
                  color="negative"
                  icon="delete"
                  size="sm"
                  round
                  class="delete-btn"
                  @click="confirmDelete(props.row.id)"
                >
                  <q-tooltip>Delete token</q-tooltip>
                </q-btn>
              </q-td>
            </q-tr>
          </template>

          <template #no-data>
            <div class="full-width row flex-center q-pa-xl text-grey-7">
              <div class="text-center empty-state">
                <q-icon name="vpn_key" size="80px" class="q-mb-md empty-icon" />
                <div class="text-h6 text-weight-medium q-mb-sm">No API tokens yet</div>
                <p class="text-body2">Create your first token to start using the DeviceSDK API</p>
                <q-btn
                  unelevated
                  color="primary"
                  label="Create Token"
                  icon="add"
                  class="q-mt-md"
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

    <q-separator class="q-my-xl" />

    <div class="page-header q-mb-md">
      <div>
        <h1 class="page-title">CLI Sessions</h1>
        <p class="page-subtitle">Active CLI login sessions on your account</p>
      </div>
    </div>

    <q-card class="modern-card" flat bordered>
      <q-card-section class="q-pa-none">
        <q-table
          :rows="cliTokens"
          :columns="cliColumns"
          row-key="id"
          :loading="cliLoading"
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
            <q-tr :props="props" class="table-row">
              <q-td key="created_at" :props="props">
                <div class="text-grey-8">
                  {{ new Date(props.row.created_at).toLocaleDateString() }}
                </div>
                <div class="text-caption text-grey-6">
                  {{ new Date(props.row.created_at).toLocaleTimeString() }}
                </div>
              </q-td>
              <q-td key="last_used_at" :props="props">
                <template v-if="props.row.last_used_at">
                  <div class="text-grey-8">
                    {{ new Date(props.row.last_used_at).toLocaleDateString() }}
                  </div>
                  <div class="text-caption text-grey-6">
                    {{ new Date(props.row.last_used_at).toLocaleTimeString() }}
                  </div>
                </template>
                <span v-else class="text-grey-6">Never</span>
              </q-td>
              <q-td key="expires_at" :props="props">
                <div class="text-grey-8">
                  {{ new Date(props.row.expires_at).toLocaleDateString() }}
                </div>
                <div class="text-caption text-grey-6">
                  {{ new Date(props.row.expires_at).toLocaleTimeString() }}
                </div>
              </q-td>
              <q-td key="actions" :props="props">
                <q-btn
                  outline
                  color="negative"
                  label="Revoke"
                  size="sm"
                  no-caps
                  class="revoke-btn"
                  @click="confirmDeleteCli(props.row.id)"
                >
                  <q-tooltip>Revoke this CLI session</q-tooltip>
                </q-btn>
              </q-td>
            </q-tr>
          </template>

          <template #no-data>
            <div class="full-width row flex-center q-pa-xl text-grey-7">
              <div class="text-center empty-state">
                <q-icon name="terminal" size="80px" class="q-mb-md empty-icon" />
                <div class="text-h6 text-weight-medium q-mb-sm">No CLI sessions</div>
                <p class="text-body2">Log in via the DeviceSDK CLI to create a session</p>
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

    <CreateTokenDialog
      v-model="showCreateDialog"
      @token-created="fetchTokens"
    />

    <q-dialog v-model="deleteDialog" persistent>
      <q-card class="delete-dialog" style="min-width: 400px">
        <q-card-section class="text-center q-pt-lg">
          <q-icon name="warning" color="negative" size="60px" class="q-mb-md" />
          <div class="text-h6 text-weight-bold q-mb-sm">{{ deleteType === 'cli' ? 'Revoke CLI Session?' : 'Delete Token?' }}</div>
          <p class="text-body2 text-grey-7">{{ deleteType === 'cli' ? 'Are you sure you want to revoke this CLI session? The CLI will need to log in again.' : 'Are you sure you want to delete this token? This action cannot be undone and will immediately revoke access.' }}</p>
        </q-card-section>

        <q-card-actions align="center" class="q-px-lg q-pb-lg q-gutter-sm">
          <q-btn
            outline
            label="Cancel"
            color="grey-7"
            style="min-width: 120px"
            v-close-popup
          />
          <q-btn
            unelevated
            :label="deleteType === 'cli' ? 'Revoke' : 'Delete'"
            color="negative"
            style="min-width: 120px"
            @click="deleteToken"
            :loading="deleting"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { tokenService, type Token, type CliToken } from '@/services/api.service';
import CreateTokenDialog from '@/components/CreateTokenDialog.vue';

const $q = useQuasar();
const tokens = ref<Token[]>([]);
const cliTokens = ref<CliToken[]>([]);
const loading = ref(false);
const cliLoading = ref(false);
const deleting = ref(false);
const showCreateDialog = ref(false);
const deleteDialog = ref(false);
const tokenToDelete = ref<string | null>(null);
const deleteType = ref<'api' | 'cli'>('api');

const columns = [
  {
    name: 'id',
    label: 'Token ID',
    field: 'id',
    align: 'left' as const,
  },
  {
    name: 'description',
    label: 'Description',
    field: 'description',
    align: 'left' as const,
  },
  {
    name: 'managed',
    label: 'Managed',
    field: 'managed',
    align: 'left' as const,
  },
  {
    name: 'last_four',
    label: 'Last Four',
    field: 'last_four',
    align: 'left' as const,
  },
  {
    name: 'created_at',
    label: 'Created At',
    field: 'created_at',
    align: 'left' as const,
  },
  {
    name: 'actions',
    label: 'Actions',
    field: 'actions',
    align: 'center' as const,
  },
];

const cliColumns = [
  {
    name: 'created_at',
    label: 'Created',
    field: 'created_at',
    align: 'left' as const,
  },
  {
    name: 'last_used_at',
    label: 'Last Used',
    field: 'last_used_at',
    align: 'left' as const,
  },
  {
    name: 'expires_at',
    label: 'Expires',
    field: 'expires_at',
    align: 'left' as const,
  },
  {
    name: 'actions',
    label: 'Actions',
    field: 'actions',
    align: 'center' as const,
  },
];

const fetchTokens = async () => {
  try {
    loading.value = true;
    tokens.value = await tokenService.getAll();
  } catch (error) {
    console.error('Error fetching tokens:', error);
  } finally {
    loading.value = false;
  }
};

const loadCliTokens = async () => {
  try {
    cliLoading.value = true;
    cliTokens.value = await tokenService.getCliTokens();
  } catch (error) {
    console.error('Error fetching CLI tokens:', error);
  } finally {
    cliLoading.value = false;
  }
};

const confirmDelete = (tokenId: string) => {
  tokenToDelete.value = tokenId;
  deleteType.value = 'api';
  deleteDialog.value = true;
};

const confirmDeleteCli = (tokenId: string) => {
  tokenToDelete.value = tokenId;
  deleteType.value = 'cli';
  deleteDialog.value = true;
};

const deleteToken = async () => {
  if (!tokenToDelete.value) return;

  try {
    deleting.value = true;
    if (deleteType.value === 'cli') {
      await tokenService.deleteCliToken(tokenToDelete.value);
      $q.notify({
        type: 'positive',
        message: 'CLI session revoked successfully',
        position: 'top',
      });
      deleteDialog.value = false;
      tokenToDelete.value = null;
      await loadCliTokens();
    } else {
      await tokenService.delete(tokenToDelete.value);
      $q.notify({
        type: 'positive',
        message: 'Token deleted successfully',
        position: 'top',
      });
      deleteDialog.value = false;
      tokenToDelete.value = null;
      await fetchTokens();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete token';
    $q.notify({
      type: 'negative',
      message,
      position: 'top',
    });
  } finally {
    deleting.value = false;
  }
};

onMounted(() => {
  void fetchTokens();
  void loadCliTokens();
});
</script>

<style scoped lang="scss">
.tokens-page {
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

.token-chip {
  background: var(--background-secondary);
  border: 1px solid var(--border);
}

.empty-state {
  padding: 4rem 2rem;
}

.empty-icon {
  opacity: 0.2;
}
</style>
