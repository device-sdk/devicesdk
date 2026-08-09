import { ref, computed, type Ref } from 'vue';
import { copyToClipboard, type QVueGlobals } from 'quasar';
import { templateCode } from '@/lib/scriptTemplates';
import {
  scriptService,
  type ScriptVersion,
  type ScriptVersionDetail,
} from '@/services/api.service';

// Mirrors the canonical platform limit (@devicesdk/core MAX_SCRIPT_SIZE_BYTES =
// 1 MiB). Kept as a local literal on purpose: the dashboard has no
// @devicesdk/core dependency, and adding one to share a single number would
// pull a build-ordered package into the SPA (and break the no-build lint /
// component-test CI jobs).
const SCRIPT_MAX_LENGTH = 1024 * 1024;

/**
 * Script-tab state and actions for the device details page: the editor
 * (content/templates/unsaved baseline), deploy/rollback, and the version
 * list/detail dialogs. Extracted from DeviceDetailsPage.vue to keep the page
 * under the ~700 LOC guideline.
 */
export function useScriptEditor(opts: {
  projectId: Ref<string>;
  deviceId: Ref<string>;
  $q: QVueGlobals;
  /** Runs after a successful deploy/rollback so the page refreshes device state. */
  onDeployed: () => Promise<void>;
}) {
  const { projectId, deviceId, $q, onDeployed } = opts;

  const scriptContent = ref('');
  const deployMessage = ref('');
  const selectedTemplate = ref<string | null>(null);
  // The last script successfully loaded from (or deployed to) the server - the
  // baseline for "does the editor hold unsaved changes?" checks.
  const savedScript = ref('');
  const deploying = ref(false);

  const versions = ref<ScriptVersion[]>([]);
  const loadingVersions = ref(false);
  const versionsError = ref<string | null>(null);
  const viewingVersion = ref<ScriptVersionDetail | null>(null);
  const versionsCached = ref(false);
  const showVersionDialog = ref(false);
  const showRollbackDialog = ref(false);
  const pendingRollbackId = ref<string | null>(null);
  const rollingBackId = ref<string | null>(null);
  // Monotonic sequence for fetchVersions stale-response guarding: an in-flight
  // request must not clear a newer request's loading state (mirrors the page's
  // AbortController identity check on fetchDevice).
  let versionsFetchSeq = 0;

  const versionColumns = [
    { name: 'version_id', label: 'Version', field: 'version_id', align: 'left' as const },
    { name: 'message', label: 'Message', field: 'message', align: 'left' as const },
    { name: 'created_at', label: 'Created', field: 'created_at', align: 'left' as const },
    { name: 'actions', label: 'Actions', field: 'actions', align: 'right' as const },
  ];

  const isScriptTooLarge = computed(() => scriptContent.value.length > SCRIPT_MAX_LENGTH);

  const loadTemplate = (templateKey: string | null) => {
    if (!templateKey || !templateCode[templateKey]) return;
    const template = templateCode[templateKey];
    const replace = () => {
      scriptContent.value = template;
      selectedTemplate.value = null;
    };
    if (scriptContent.value === template || scriptContent.value === savedScript.value) {
      replace();
      return;
    }
    // Loading a template overwrites the editor; confirm first so unsaved work
    // isn't silently discarded.
    $q.dialog({
      title: 'Replace unsaved changes?',
      message:
        'Loading this template replaces the script in the editor. Unsaved changes will be lost.',
      cancel: { label: 'Cancel', flat: true },
      ok: { label: 'Replace', color: 'negative', unelevated: true },
    })
      .onOk(replace)
      .onDismiss(() => {
        selectedTemplate.value = null;
      });
  };

  const fetchCurrentScript = async () => {
    // Capture the ids at call time and verify them on resolve: a slow response
    // for the previous device must not clobber the new device's editor.
    const pid = projectId.value;
    const did = deviceId.value;
    try {
      const current = await scriptService.getCurrent(pid, did);
      if (projectId.value !== pid || deviceId.value !== did) return;
      savedScript.value = current.script || '';
      scriptContent.value = current.script || '';
    } catch {
      // No script deployed yet, that's ok
    }
  };

  const fetchVersions = async (force = false) => {
    if (versionsCached.value && !force) return;
    const seq = ++versionsFetchSeq;
    const pid = projectId.value;
    const did = deviceId.value;
    try {
      loadingVersions.value = true;
      versionsError.value = null;
      // Hold in a local and assign only after the id check (same pattern as
      // fetchCurrentScript): a slow response for the previous device must not
      // clobber the new device's version list.
      const fetched = await scriptService.getVersions(pid, did);
      if (projectId.value !== pid || deviceId.value !== did) return;
      versions.value = fetched;
      versionsCached.value = true;
    } catch (error) {
      if (projectId.value !== pid || deviceId.value !== did) return;
      console.error('Error fetching versions:', error);
      versionsError.value =
        error instanceof Error ? error.message : 'Failed to load versions';
    } finally {
      if (seq === versionsFetchSeq) loadingVersions.value = false;
    }
  };

  const deployScript = async () => {
    if (isScriptTooLarge.value) {
      $q.notify({ type: 'negative', message: 'Script exceeds maximum size of 1MB', position: 'top' });
      return;
    }
    try {
      deploying.value = true;
      await scriptService.upload(projectId.value, deviceId.value, {
        script: scriptContent.value,
        message: deployMessage.value || undefined,
      });
      $q.notify({ type: 'positive', message: 'Script deployed successfully', position: 'top' });
      deployMessage.value = '';
      savedScript.value = scriptContent.value;
      versionsCached.value = false;
      await onDeployed();
      await fetchVersions(true);
    } catch (error) {
      console.error('Error deploying script:', error);
      const message = error instanceof Error ? error.message : 'Failed to deploy script';
      $q.notify({ type: 'negative', message, position: 'top' });
    } finally {
      deploying.value = false;
    }
  };

  const viewVersion = async (versionId: string) => {
    try {
      viewingVersion.value = await scriptService.getVersion(projectId.value, deviceId.value, versionId);
      showVersionDialog.value = true;
    } catch (error) {
      console.error('Error fetching version:', error);
      $q.notify({ type: 'negative', message: 'Failed to load version', position: 'top' });
    }
  };

  const promptRollback = (versionId: string) => {
    pendingRollbackId.value = versionId;
    showRollbackDialog.value = true;
  };

  const confirmRollback = async () => {
    const versionId = pendingRollbackId.value;
    if (!versionId) return;
    try {
      rollingBackId.value = versionId;
      await scriptService.deployVersion(projectId.value, deviceId.value, versionId);
      showRollbackDialog.value = false;
      $q.notify({ type: 'positive', message: 'Version deployed successfully', position: 'top' });
      versionsCached.value = false;
      await onDeployed();
      await fetchVersions(true);
      await fetchCurrentScript();
    } catch (error) {
      console.error('Error deploying version:', error);
      const message = error instanceof Error ? error.message : 'Failed to deploy version';
      $q.notify({ type: 'negative', message, position: 'top' });
    } finally {
      rollingBackId.value = null;
      pendingRollbackId.value = null;
    }
  };

  // Insert two spaces on Tab instead of moving focus out of the editor, so users
  // can indent code in the textarea.
  const onEditorTab = (e: KeyboardEvent) => {
    e.preventDefault();
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = scriptContent.value;
    scriptContent.value = `${value.slice(0, start)}  ${value.slice(end)}`;
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = start + 2;
    });
  };

  const copyViewingScript = async () => {
    if (!viewingVersion.value?.script) return;
    try {
      await copyToClipboard(viewingVersion.value.script);
      $q.notify({ type: 'positive', message: 'Script copied to clipboard', position: 'top' });
    } catch {
      $q.notify({ type: 'negative', message: 'Failed to copy script', position: 'top' });
    }
  };

  /**
   * Resets every device-scoped bit of state when the route switches device.
   * The page stays mounted when navigating between devices of the same route,
   * so without this the Script tab would show (and deploy!) the previous
   * device's code.
   */
  const resetForDeviceSwitch = () => {
    versionsCached.value = false;
    scriptContent.value = '';
    savedScript.value = '';
    deployMessage.value = '';
    selectedTemplate.value = null;
    versions.value = [];
    versionsError.value = null;
    loadingVersions.value = false;
    viewingVersion.value = null;
    showVersionDialog.value = false;
    pendingRollbackId.value = null;
    showRollbackDialog.value = false;
  };

  return {
    scriptContent,
    deployMessage,
    selectedTemplate,
    savedScript,
    deploying,
    versions,
    loadingVersions,
    versionsError,
    viewingVersion,
    versionsCached,
    showVersionDialog,
    showRollbackDialog,
    pendingRollbackId,
    rollingBackId,
    versionColumns,
    isScriptTooLarge,
    loadTemplate,
    fetchCurrentScript,
    fetchVersions,
    deployScript,
    viewVersion,
    promptRollback,
    confirmRollback,
    onEditorTab,
    copyViewingScript,
    resetForDeviceSwitch,
  };
}
