import { api } from '@/lib/api';

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
    const data = await api.call<ApiResponse<Project[]>>('/v1/projects');
    if (!data || !data.success) {
      throw new Error('Failed to fetch projects');
    }
    return data.result;
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
    const data = await api.call<ApiResponse<Device[]>>(
      `/v1/projects/${projectId}/devices`
    );
    if (!data || !data.success) {
      throw new Error('Failed to fetch devices');
    }
    return data.result;
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

export interface LogsResponse {
  logs: DeviceLog[];
  next_cursor: string | null;
}

export const logService = {
  async getLogs(
    projectId: string,
    deviceId: string,
    options?: { cursor?: string | undefined; limit?: number | undefined; level?: string | undefined },
  ): Promise<LogsResponse> {
    const params = new URLSearchParams();
    if (options?.cursor != null) params.set('cursor', options.cursor);
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.level) params.set('level', options.level);
    const qs = params.toString();
    const url = `/v1/projects/${projectId}/devices/${deviceId}/logs${qs ? `?${qs}` : ''}`;
    const data = await api.call<ApiResponse<LogsResponse>>(url);
    if (!data || !data.success) {
      throw new Error('Failed to fetch logs');
    }
    return data.result;
  },
};

// ============================================================================
// Token Endpoints
// ============================================================================

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
    const data = await api.call<ApiResponse<Token[]>>('/v1/tokens');
    if (!data || !data.success) {
      throw new Error('Failed to fetch tokens');
    }
    return data.result;
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
};
