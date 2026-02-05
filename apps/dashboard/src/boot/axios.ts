import axios, { type AxiosInstance } from 'axios';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const baseURL = import.meta.env.PROD
  ? 'https://api.devicesdk.com'
  : 'http://localhost:8787';

const api = axios.create({ baseURL });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default ({ app }: any) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
};

export { api };
