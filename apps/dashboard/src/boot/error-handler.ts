import { Notify } from 'quasar';
import type { App } from 'vue';

/**
 * Global Vue error + warning handlers.
 *
 * Without this, an exception in a component render or watcher silently kills
 * the UI subtree and the user sees a blank page. We surface every uncaught
 * error to the user via Quasar's Notify plugin and log it to the console for
 * dev tooling, so failures are visible without bringing down the whole app.
 */
export default ({ app }: { app: App }) => {
  app.config.errorHandler = (err, _instance, info) => {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error('[App Error]', err, info);
    Notify.create({
      type: 'negative',
      message,
      timeout: 5000,
      position: 'top',
      ...(info ? { caption: `at ${info}` } : {}),
    });
  };

  app.config.warnHandler = (msg, _instance, trace) => {
    console.warn('[App Warn]', msg, trace);
  };
};
