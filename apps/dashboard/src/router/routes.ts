import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('pages/LoginPage.vue'),
    meta: { public: true, title: 'Sign in' },
  },
  {
    path: '/terms',
    component: () => import('pages/TermsPage.vue'),
    meta: { public: true, title: 'Terms of Service' },
  },
  {
    path: '/',
    redirect: '/projects',
  },
  {
    path: '/projects',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('pages/ProjectsPage.vue'), meta: { title: 'Projects' } },
    ],
  },
  {
    path: '/projects/:projectId',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('pages/ProjectDetailsPage.vue'), meta: { title: 'Project' } },
    ],
  },
  {
    path: '/projects/:projectId/devices/:deviceId',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('pages/DeviceDetailsPage.vue'), meta: { title: 'Device' } },
    ],
  },
  {
    path: '/tokens',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('pages/TokensPage.vue'), meta: { title: 'API Tokens' } },
    ],
  },
  {
    path: '/account',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('pages/AccountPage.vue'), meta: { title: 'Account' } },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
    meta: { title: 'Page not found' },
  },
];

export default routes;
