import { WS_API_HOST } from '@/config/apiHost';
import { api } from '@/lib/api';

// ============================================================================
// Pagination Helper
// ============================================================================

interface PaginatedResponse<T> {
  items: T[];
  page: number;
  per_page: number;
  has_more: boolean;
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const per_page = 100;
  let hasMore = true;
  while (hasMore) {
    const data = await api.call<ApiResponse<PaginatedResponse<T>>>(
      `${url}?page=${page}&per_page=${per_page}`,
    );
    if (!data?.success) throw new Error('Failed to fetch');
    all.push(...data.result.items);
    hasMore = data.result.has_more;
    page++;
  }
  return all;
}

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  name?: string;
  email: string;
  picture?: string;
  verified_email: number;
  created_at: number;
  onboarding_completed: number;
  plan: 'free' | 'paid';
  limits: {
    max_projects: number;
    max_devices_per_project: number;
    max_script_versions_per_device: number;
    max_api_tokens: number;
    max_messages_per_device_per_day: number;
    max_env_vars_per_project: number;
  };
  usage: {
    projects: number;
    api_tokens: number;
  };
}

export interface Project {
  id: string;
  project_slug: string;
  name?: string | null;
  description?: string | null;
  created_at: number;
  updated_at?: number;
  device_count?: number;
  devices?: DeviceSummary[];
}

export interface DeviceSummary {
  device_id: string;
  name?: string | null;
  status: string;
  last_connected_at?: number | null;
}

export interface Device {
  id: string;
  device_id: string;
  name?: string | null;
  description?: string | null;
  current_version_id?: string | null;
  last_connected_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface ScriptVersion {
  version_id: string;
  message?: string | null;
  is_current: boolean;
  created_at: number;
}

export interface ScriptVersionDetail {
  version_id: string;
  message?: string | null;
  script: string;
  created_at: number;
}

export interface CurrentScript {
  version_id?: string | null;
  script: string;
}

export interface Token {
  id: string;
  last_four: string;
  created_at: number;
  description?: string | null;
  managed?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  result: T;
}

// ============================================================================
// User Endpoints
// ============================================================================

export const userService = {
  async getMe(): Promise<User> {
    const data = await api.call<ApiResponse<User>>('/v1/user/me');
    if (!data || !data.success) {
      throw new Error('Failed to fetch user');
    }
    return data.result;
  },

  async logout(): Promise<void> {
    try {
      await api.call('/v1/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error calling logout endpoint:', error);
    }
  },

  async deleteAccount(): Promise<{ deletion_scheduled_at: number }> {
    const data = await api.call<ApiResponse<{ deletion_scheduled_at: number }>>('/v1/user/me', {
      method: 'DELETE',
    });
    if (!data || !data.success) {
      throw new Error('Failed to delete account');
    }
    return data.result;
  },

  async completeOnboarding(): Promise<void> {
    await api.call('/v1/user/me/onboarding', { method: 'PATCH' });
  },
};

// ============================================================================
// Project Endpoints
// ============================================================================

export interface CreateProjectInput {
  project_slug: string;
  name?: string | undefined;
  description?: string | undefined;
}

export interface UpdateProjectInput {
  name?: string | undefined;
  description?: string | undefined;
}

export const projectService = {
  async getAll(): Promise<Project[]> {
    return fetchAllPages<Project>('/v1/projects');
  },

  async getById(projectId: string): Promise<Project> {
    const data = await api.call<ApiResponse<Project>>(
      `/v1/projects/${projectId}`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch project');
    }
    return data.result;
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const data = await api.call<ApiResponse<Project>>('/v1/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!data || !data.success) {
      throw new Error('Failed to create project');
    }
    return data.result;
  },

  async update(
    projectId: string,
    input: UpdateProjectInput
  ): Promise<Project> {
    const data = await api.call<ApiResponse<Project>>(
      `/v1/projects/${projectId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
    if (!data || !data.success) {
      throw new Error('Failed to update project');
    }
    return data.result;
  },

  async delete(projectId: string): Promise<void> {
    await api.call(`/v1/projects/${projectId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// Device Endpoints
// ============================================================================

export interface CreateDeviceInput {
  device_id: string;
  name?: string | undefined;
  description?: string | undefined;
}

export interface UpdateDeviceInput {
  name?: string | undefined;
  description?: string | undefined;
}

export const deviceService = {
  async getAll(projectId: string): Promise<Device[]> {
    return fetchAllPages<Device>(`/v1/projects/${projectId}/devices`);
  },

  async getById(projectId: string, deviceId: string): Promise<Device> {
    const data = await api.call<ApiResponse<Device>>(
      `/v1/projects/${projectId}/devices/${deviceId}`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch device');
    }
    return data.result;
  },

  async create(projectId: string, input: CreateDeviceInput): Promise<Device> {
    const data = await api.call<ApiResponse<Device>>(
      `/v1/projects/${projectId}/devices`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    if (!data || !data.success) {
      throw new Error('Failed to create device');
    }
    return data.result;
  },

  async update(
    projectId: string,
    deviceId: string,
    input: UpdateDeviceInput
  ): Promise<Device> {
    const data = await api.call<ApiResponse<Device>>(
      `/v1/projects/${projectId}/devices/${deviceId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
    if (!data || !data.success) {
      throw new Error('Failed to update device');
    }
    return data.result;
  },

  async delete(projectId: string, deviceId: string): Promise<void> {
    await api.call(`/v1/projects/${projectId}/devices/${deviceId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// Script Endpoints
// ============================================================================

export interface UploadScriptInput {
  script: string;
  message?: string | undefined;
}

export interface UploadScriptResponse {
  version_id: string;
  device_id: string;
  message?: string | null;
  created_at: number;
}

export interface DeployVersionResponse {
  version_id: string;
  device_id: string;
  deployed_at: number;
}

export const scriptService = {
  async getCurrent(projectId: string, deviceId: string): Promise<CurrentScript> {
    const data = await api.call<ApiResponse<CurrentScript>>(
      `/v1/projects/${projectId}/devices/${deviceId}/script`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch script');
    }
    return data.result;
  },

  async upload(
    projectId: string,
    deviceId: string,
    input: UploadScriptInput
  ): Promise<UploadScriptResponse> {
    const data = await api.call<ApiResponse<UploadScriptResponse>>(
      `/v1/projects/${projectId}/devices/${deviceId}/script`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
    if (!data || !data.success) {
      throw new Error('Failed to upload script');
    }
    return data.result;
  },

  async getVersions(projectId: string, deviceId: string): Promise<ScriptVersion[]> {
    const data = await api.call<ApiResponse<ScriptVersion[]>>(
      `/v1/projects/${projectId}/devices/${deviceId}/script/versions`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch script versions');
    }
    return data.result;
  },

  async getVersion(
    projectId: string,
    deviceId: string,
    versionId: string
  ): Promise<ScriptVersionDetail> {
    const data = await api.call<ApiResponse<ScriptVersionDetail>>(
      `/v1/projects/${projectId}/devices/${deviceId}/script/versions/${versionId}`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch script version');
    }
    return data.result;
  },

  async deployVersion(
    projectId: string,
    deviceId: string,
    versionId: string
  ): Promise<DeployVersionResponse> {
    const data = await api.call<ApiResponse<DeployVersionResponse>>(
      `/v1/projects/${projectId}/devices/${deviceId}/script/versions/${versionId}/deploy`,
      {
        method: 'POST',
      }
    );
    if (!data || !data.success) {
      throw new Error('Failed to deploy version');
    }
    return data.result;
  },
};

// ============================================================================
// Log Endpoints
// ============================================================================

export interface DeviceLog {
  id: string;
  level: string;
  message: string;
  created_at: number;
}

export interface DeviceStatus {
  connected: boolean;
  connectedSince: number | null;
}

export const logService = {
  /**
   * Returns the WebSocket URL for the generic watch endpoint. Receives JSON
   * frames of the form `{ event: "status" | "log" | "state" | "history_complete", data: ... }`.
   * The browser sends the session cookie automatically on the upgrade.
   *
   * Pass `backfillLimit` to receive up to N recent log entries on connect as
   * `{ event: "log", data, replay: true }` frames followed by a single
   * `{ event: "history_complete" }` marker. Subsequent live events arrive on
   * the same socket. This replaces the deprecated HTTP `/logs` endpoint.
   */
  getWatchUrl(
    projectId: string,
    deviceId: string,
    options?: { backfillLimit?: number; backfillLevel?: string },
  ): string {
    const base = `${WS_API_HOST}/v1/projects/${projectId}/devices/${deviceId}/watch`;
    const params = new URLSearchParams();
    if (options?.backfillLimit != null) {
      params.set('backfillLimit', String(options.backfillLimit));
    }
    if (options?.backfillLevel) {
      params.set('backfillLevel', options.backfillLevel);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  },
};

// ============================================================================
// Metrics Endpoints
// ============================================================================

export type MetricsWindow = '1h' | '12h' | '7d';

/** One time bucket of usage; mirrors the API's snake_case wire shape. */
export interface UsageBucket {
  ts: number;
  messages_in: number;
  messages_out: number;
  bytes_in: number;
  bytes_out: number;
  cron_fires: number;
  connected_seconds: number;
  estimated_cost_usd: number;
}

export type UsageTotals = Omit<UsageBucket, 'ts'>;

export interface DeviceMetrics {
  window: string;
  bucket_seconds: number;
  series: UsageBucket[];
  totals: UsageTotals;
}

export interface ProjectDeviceMetrics {
  device_id: string;
  name: string | null;
  series: UsageBucket[];
  totals: UsageTotals;
}

export interface ProjectMetrics {
  window: string;
  bucket_seconds: number;
  devices: ProjectDeviceMetrics[];
  totals: UsageTotals;
  billing: {
    window: string;
    daily: { ts: number; estimated_cost_usd: number }[];
    total_usd: number;
  };
}

export const metricsService = {
  async getDevice(
    projectId: string,
    deviceId: string,
    window: MetricsWindow = '1h',
  ): Promise<DeviceMetrics> {
    const data = await api.call<ApiResponse<DeviceMetrics>>(
      `/v1/projects/${projectId}/devices/${deviceId}/metrics?window=${window}`,
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch device metrics');
    }
    return data.result;
  },

  async getProject(
    projectId: string,
    window: MetricsWindow = '12h',
  ): Promise<ProjectMetrics> {
    const data = await api.call<ApiResponse<ProjectMetrics>>(
      `/v1/projects/${projectId}/metrics?window=${window}`,
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch project metrics');
    }
    return data.result;
  },
};

// ============================================================================
// Token Endpoints
// ============================================================================

export interface CliToken {
  id: string;
  created_at: number;
  expires_at: number;
  last_used_at?: number | null;
}

export interface CreateTokenInput {
  description?: string;
  managed?: boolean;
}

export interface CreateTokenResponse {
  id: string;
  token: string;
  created_at: number;
  description?: string | null;
  managed?: boolean;
}

export const tokenService = {
  async getAll(): Promise<Token[]> {
    return fetchAllPages<Token>('/v1/tokens');
  },

  async create(input?: CreateTokenInput): Promise<CreateTokenResponse> {
    const data = await api.call<ApiResponse<CreateTokenResponse>>(
      '/v1/tokens',
      {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }
    );
    if (!data || !data.success) {
      throw new Error('Failed to create token');
    }
    return data.result;
  },

  async delete(tokenId: string): Promise<void> {
    await api.call(`/v1/tokens/${tokenId}`, {
      method: 'DELETE',
    });
  },

  async getCliTokens(): Promise<CliToken[]> {
    const data = await api.call<ApiResponse<CliToken[]>>('/v1/tokens/cli');
    if (!data || !data.success) throw new Error('Failed to fetch CLI tokens');
    return data.result;
  },

  async deleteCliToken(tokenId: string): Promise<void> {
    await api.call(`/v1/tokens/cli/${tokenId}`, { method: 'DELETE' });
  },
};

// ============================================================================
// Aggregated API Service
// ============================================================================

export const apiService = {
  user: userService,
  project: projectService,
  device: deviceService,
  script: scriptService,
  token: tokenService,
  log: logService,
  metrics: metricsService,
};
