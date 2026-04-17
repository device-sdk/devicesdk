import axios, { type AxiosInstance } from 'axios';
import { API_HOST } from '@/config/apiHost';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const api = axios.create({ baseURL: API_HOST });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default ({ app }: any) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
};

export { api };
