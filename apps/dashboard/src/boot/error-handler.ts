import { Notify } from 'quasar';
import type { App } from 'vue';
import { ApiError } from '@/lib/api';

/**
 * Global Vue error + warning handlers, plus an unhandled-rejection net.
 *
 * Without this, an exception in a component render or watcher silently kills
 * the UI subtree and the user sees a blank page, and a rejected promise from an
 * un-awaited async event handler vanishes with no feedback. We surface every
 * uncaught error to the user via Quasar's Notify plugin and log it to the
 * console, so failures are visible without bringing down the whole app.
 */
function notifyError(message: string, caption?: string) {
  Notify.create({
    type: 'negative',
    message,
    timeout: 5000,
    position: 'top',
    ...(caption ? { caption } : {}),
  });
}

export default ({ app }: { app: App }) => {
  app.config.errorHandler = (err, _instance, info) => {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error('[App Error]', err, info);
    notifyError(message, info ? `at ${info}` : undefined);
  };

  app.config.warnHandler = (msg, _instance, trace) => {
    console.warn('[App Warn]', msg, trace);
  };

  // Catch rejected promises from un-awaited async event handlers (e.g. a failed
  // mutation in a click handler that didn't try/catch). The API client already
  // redirects on 401, so those resolve to a never-settling promise and never
  // land here.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    // Aborted requests (navigation/unmount) are expected - don't alarm the user.
    if (reason instanceof DOMException && reason.name === 'AbortError') {
      event.preventDefault();
      return;
    }
    const message =
      reason instanceof ApiError
        ? reason.message
        : reason instanceof Error
          ? reason.message
          : 'An unexpected error occurred';
    console.error('[Unhandled Rejection]', reason);
    notifyError(message);
    event.preventDefault();
  });
};
