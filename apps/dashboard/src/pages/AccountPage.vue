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
            This will permanently delete all your projects, devices, and data. This action cannot be undone.
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
            @click="deleteAccount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuth } from '@/composables/useAuth';

const $q = useQuasar();
const auth = useAuth();
const user = auth.user;

const showDeleteDialog = ref(false);
const deleteConfirmation = ref('');

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const deleteAccount = () => {
  $q.notify({
    type: 'info',
    message: 'Account deletion is not yet implemented',
    position: 'top',
  });
  showDeleteDialog.value = false;
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
