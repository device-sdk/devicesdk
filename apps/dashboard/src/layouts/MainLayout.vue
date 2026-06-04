<template>
  <q-layout view="lHh Lpr lFf">
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <q-header class="app-header">
      <q-toolbar class="q-px-md">
        <q-btn flat dense round icon="menu" aria-label="Toggle navigation menu" @click="toggleLeftDrawer" />

        <q-toolbar-title class="logo-text">
          <img src="/favicon.svg" alt="DeviceSDK" class="logo-icon" />
          DeviceSDK
        </q-toolbar-title>

        <q-space />

        <q-btn flat no-caps class="user-btn q-ml-sm" aria-label="Account menu">
          <q-avatar size="28px" class="q-mr-sm">
            <img v-if="auth.user?.picture" :src="auth.user.picture" />
            <q-icon v-else name="person" size="16px" />
          </q-avatar>
          <span class="user-email">{{ auth.user?.email }}</span>
          <q-icon name="expand_more" size="18px" class="q-ml-xs" />

          <q-menu anchor="bottom right" self="top right" class="user-menu">
            <q-list style="min-width: 200px">
              <q-item class="user-menu-header">
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{ auth.user?.name || 'User' }}</q-item-label>
                  <q-item-label caption>{{ auth.user?.email }}</q-item-label>
                </q-item-section>
              </q-item>

              <q-separator />

              <q-item clickable v-close-popup to="/account">
                <q-item-section avatar>
                  <q-icon name="settings" size="20px" />
                </q-item-section>
                <q-item-section>Settings</q-item-section>
              </q-item>

              <q-separator />

              <q-item clickable v-close-popup @click="handleSignOut" class="text-negative">
                <q-item-section avatar>
                  <q-icon name="logout" size="20px" />
                </q-item-section>
                <q-item-section>Sign out</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered class="app-drawer">
      <div class="drawer-header">
        <div class="drawer-logo">
          <img src="/favicon.svg" alt="DeviceSDK" class="logo-icon" />
          DeviceSDK
        </div>
      </div>

      <q-list class="nav-list">
        <q-item-label header class="nav-header">Platform</q-item-label>

        <q-item
          clickable
          :active="$route.path.startsWith('/projects')"
          active-class="nav-item-active"
          to="/projects"
          class="nav-item"
        >
          <q-item-section avatar>
            <q-icon name="folder_open" size="20px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Projects</q-item-label>
          </q-item-section>
        </q-item>

        <q-item
          clickable
          :active="$route.path === '/tokens'"
          active-class="nav-item-active"
          to="/tokens"
          class="nav-item"
        >
          <q-item-section avatar>
            <q-icon name="key" size="20px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>API Tokens</q-item-label>
          </q-item-section>
        </q-item>

        <q-separator class="q-my-md" />

        <q-item-label header class="nav-header">Account</q-item-label>

        <q-item
          clickable
          :active="$route.path === '/account'"
          active-class="nav-item-active"
          to="/account"
          class="nav-item"
        >
          <q-item-section avatar>
            <q-icon name="settings" size="20px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Settings</q-item-label>
          </q-item-section>
        </q-item>

        <q-item
          clickable
          class="nav-item text-negative"
          @click="handleSignOut"
        >
          <q-item-section avatar>
            <q-icon name="logout" size="20px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Sign out</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container id="main-content">
      <q-banner
        v-if="showBetaBanner"
        class="beta-banner bg-blue-1 text-blue-9"
        dense
      >
        <template v-slot:avatar>
          <q-icon name="info" color="blue-7" />
        </template>
        DeviceSDK is in open beta. Report issues via
        <a href="mailto:support@devicesdk.com" class="text-blue-8 text-weight-medium">support@devicesdk.com</a>,
        <a href="https://github.com/device-sdk" target="_blank" rel="noopener" class="text-blue-8 text-weight-medium">GitHub</a>, or
        <a href="https://discord.gg/WuNhbXGsBy" target="_blank" rel="noopener" class="text-blue-8 text-weight-medium">Discord</a>.
        <template v-slot:action>
          <q-btn flat dense icon="close" color="blue-7" @click="dismissBetaBanner" />
        </template>
      </q-banner>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '@/composables/useAuth';

const auth = useAuth();
const leftDrawerOpen = ref(false);
// Versioned key: bump the suffix to re-surface the banner to everyone after a
// material change to its content, instead of it staying dismissed forever.
const BETA_BANNER_KEY = 'devicesdk-beta-banner-dismissed-v1';
const showBetaBanner = ref(!localStorage.getItem(BETA_BANNER_KEY));

function dismissBetaBanner() {
  showBetaBanner.value = false;
  localStorage.setItem(BETA_BANNER_KEY, 'true');
}

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}

async function handleSignOut() {
  await auth.signOut();
}
</script>

<style scoped lang="scss">
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 10000;
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;

  &:focus {
    left: 0.5rem;
    top: 0.5rem;
  }
}

.app-header {
  background: var(--background);
  color: var(--foreground);
  border-bottom: 1px solid var(--border);
  box-shadow: none;

  :deep(.q-toolbar) {
    min-height: 56px;
  }
}

.logo-text {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  width: 22px;
  height: 22px;
  border-radius: 3px;
}

.header-icon {
  color: var(--foreground-muted);

  &:hover {
    color: var(--foreground);
    background: var(--accent);
  }
}

.user-btn {
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius);
  color: var(--foreground);

  &:hover {
    background: var(--accent);
  }

  .user-email {
    font-size: 0.875rem;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.app-drawer {
  background: var(--background);
}

.drawer-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.drawer-logo {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-list {
  padding: 0.75rem;
}

.nav-header {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--foreground-muted);
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.25rem;
}

.nav-item {
  border-radius: var(--radius);
  min-height: 40px;
  padding: 0 0.75rem;
  margin-bottom: 2px;
  transition: background-color 0.15s ease;

  :deep(.q-item__section--avatar) {
    min-width: 32px;
    color: var(--foreground-muted);
  }

  :deep(.q-item__label) {
    font-size: 0.875rem;
    font-weight: 500;
  }

  &:hover {
    background: var(--accent);
  }
}

.nav-item-active {
  background: var(--accent) !important;

  :deep(.q-item__section--avatar) {
    color: var(--foreground);
  }

  :deep(.q-item__label) {
    color: var(--foreground);
    font-weight: 600;
  }
}

.beta-banner {
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border);
}
</style>
