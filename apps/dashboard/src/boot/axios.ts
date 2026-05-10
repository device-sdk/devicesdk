import axios, { type AxiosInstance } from 'axios';
import type { App } from 'vue';
import { API_HOST } from '@/config/apiHost';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const api = axios.create({ baseURL: API_HOST });

export default ({ app }: { app: App }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
};

export { api };
