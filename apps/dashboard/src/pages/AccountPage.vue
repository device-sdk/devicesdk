<template>
  <q-page class="account-page q-pa-lg">
    <div class="q-mb-md">
      <h1 class="page-title">Account</h1>
      <p class="page-subtitle">Manage your profile and settings</p>
    </div>

    <div class="row q-col-gutter-lg">
      <div class="col-12 col-md-6">
        <q-card class="modern-card" flat bordered>
          <q-card-section>
            <div class="text-subtitle1 text-weight-bold q-mb-md">Profile</div>
            
            <div class="row items-center q-mb-lg">
              <q-avatar size="80px" class="q-mr-lg">
                <img v-if="user?.picture" :src="user.picture" alt="Profile picture" />
                <q-icon v-else name="person" size="40px" />
              </q-avatar>
              <div>
                <div class="text-h6 text-weight-medium">{{ user?.name || 'User' }}</div>
                <div class="text-body2 text-grey-7">{{ user?.email }}</div>
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="info-row">
              <span class="info-label">Email</span>
              <span class="info-value">{{ user?.email }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Email Verified</span>
              <q-chip
                :color="user?.verified_email ? 'positive' : 'warning'"
                text-color="white"
                size="sm"
              >
                {{ user?.verified_email ? 'Verified' : 'Not Verified' }}
              </q-chip>
            </div>
            <div class="info-row">
              <span class="info-label">Member Since</span>
              <span class="info-value">{{ user?.created_at ? formatDate(user.created_at) : '—' }}</span>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12" v-if="user">
        <q-card class="modern-card" flat bordered>
          <q-card-section>
            <div class="row items-center q-mb-md">
              <div class="text-subtitle1 text-weight-bold q-mr-md">Plan & Usage</div>
              <q-chip
                :color="user.plan === 'paid' ? 'primary' : 'positive'"
                text-color="white"
                size="sm"
              >
                {{ user.plan === 'paid' ? 'Paid' : 'Free' }}
              </q-chip>
            </div>

            <div class="row q-col-gutter-lg">
              <div class="col-12 col-md-6">
                <div class="text-body2 text-weight-medium q-mb-xs">
                  Projects
                  <span class="text-grey-6 q-ml-xs">{{ user.usage.projects }} / {{ user.limits.max_projects }}</span>
                </div>
                <q-linear-progress
                  :value="user.limits.max_projects > 0 ? user.usage.projects / user.limits.max_projects : 0"
                  :color="usageColor(user.usage.projects, user.limits.max_projects)"
                  track-color="grey-3"
                  rounded
                  size="8px"
                  class="q-mb-md"
                />

                <div class="text-body2 text-weight-medium q-mb-xs">
                  API Tokens
                  <span class="text-grey-6 q-ml-xs">{{ user.usage.api_tokens }} / {{ user.limits.max_api_tokens }}</span>
                </div>
                <q-linear-progress
                  :value="user.limits.max_api_tokens > 0 ? user.usage.api_tokens / user.limits.max_api_tokens : 0"
                  :color="usageColor(user.usage.api_tokens, user.limits.max_api_tokens)"
                  track-color="grey-3"
                  rounded
                  size="8px"
                />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-body2 text-weight-medium q-mb-sm">Tier Limits</div>
                <div
                  v-for="item in tierLimits"
                  :key="item.label"
                  class="info-row"
                >
                  <span class="info-label">{{ item.label }}</span>
                  <span class="info-value">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <q-separator class="q-my-md" />

            <div class="text-caption text-grey-6">
              Need more? Contact
              <a href="mailto:support@devicesdk.com" class="text-primary">support@devicesdk.com</a>
              for plan upgrades.
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-6">
        <q-card class="modern-card" flat bordered>
          <q-card-section>
            <div class="text-subtitle1 text-weight-bold q-mb-md">Preferences</div>
            
            <div class="text-center q-pa-lg">
              <q-icon name="tune" size="48px" color="grey-4" class="q-mb-md" />
              <div class="text-body2 text-grey-6">
                Preferences will be available in a future update
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-card class="modern-card q-mt-lg" flat bordered>
          <q-card-section>
            <div class="text-subtitle1 text-weight-bold text-negative q-mb-md">Danger Zone</div>
            
            <q-card flat bordered class="bg-red-1">
              <q-card-section>
                <div class="row items-center justify-between">
                  <div>
                    <div class="text-weight-medium">Delete Account</div>
                    <div class="text-caption text-grey-7">
                      Permanently delete your account and all data
                    </div>
                  </div>
                  <q-btn
                    outline
                    color="negative"
                    label="Delete Account"
                    @click="showDeleteDialog = true"
                  />
                </div>
              </q-card-section>
            </q-card>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="showDeleteDialog">
      <q-card style="min-width: 400px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
          <span class="text-h6">Delete Account</span>
        </q-card-section>
        <q-card-section>
          <p>Are you sure you want to delete your account?</p>
          <p class="text-caption text-negative q-mb-md">
            Your account will be scheduled for deletion with a 7-day grace period.
            During this time you will not be able to log in.
            After 7 days, all your projects, devices, and data will be permanently deleted.
            Contact support@devicesdk.com within the grace period to cancel.
          </p>
          <p>Type <strong>DELETE</strong> to confirm:</p>
          <q-input v-model="deleteConfirmation" outlined dense placeholder="DELETE" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            flat
            color="negative"
            label="Delete Account"
            :disable="deleteConfirmation !== 'DELETE'"
            :loading="deleting"
            @click="deleteAccount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import { useAuth } from '@/composables/useAuth';
import { userService } from '@/services/api.service';
import { formatDate } from '@/lib/time';

const $q = useQuasar();
const auth = useAuth();
const user = auth.user;

const showDeleteDialog = ref(false);
const deleteConfirmation = ref('');
const deleting = ref(false);

function usageColor(used: number, max: number): string {
  const ratio = max > 0 ? used / max : 0;
  if (ratio >= 1) return 'negative';
  if (ratio >= 0.8) return 'warning';
  return 'positive';
}

const tierLimits = computed(() => {
  const limits = user?.limits;
  if (!limits) return [];
  return [
    { label: 'Max devices per project', value: limits.max_devices_per_project },
    { label: 'Max script versions per device', value: limits.max_script_versions_per_device },
    { label: 'Max messages per device per day', value: limits.max_messages_per_device_per_day.toLocaleString() },
    { label: 'Max env vars per project', value: limits.max_env_vars_per_project },
  ];
});

const deleteAccount = async () => {
  try {
    deleting.value = true;
    const result = await userService.deleteAccount();
    const scheduledDate = formatDate(result.deletion_scheduled_at);
    $q.notify({
      type: 'warning',
      message: `Account deletion scheduled for ${scheduledDate}. Contact support@devicesdk.com to cancel.`,
      position: 'top',
      timeout: 5000,
    });
    showDeleteDialog.value = false;
    deleteConfirmation.value = '';
    await auth.signOut();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete account. Please try again.';
    $q.notify({
      type: 'negative',
      message,
      position: 'top',
    });
  } finally {
    deleting.value = false;
  }
};
</script>

<style scoped lang="scss">
.account-page {
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
