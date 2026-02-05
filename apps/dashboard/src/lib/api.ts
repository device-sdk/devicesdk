const API_BASE_URL = import.meta.env.PROD
  ? 'https://api.devicesdk.com'
  : 'http://localhost:8787';

type ApiCallOptions = RequestInit;

async function call<T>(path: string, options?: ApiCallOptions): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const defaultOptions: RequestInit = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  const finalOptions: RequestInit = {
    ...defaultOptions,
    ...options,
  };

  try {
    const response = await fetch(url, finalOptions);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        // Not a JSON response
      }
      
      // Extract error message from API response
      let errorMessage = response.statusText || 'API request failed';
      if (errorData?.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        errorMessage = errorData.errors.map((e: { message?: string } | string) => {
          if (typeof e === 'string') return e;
          return e.message ?? 'Unknown error';
        }).join('; ');
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
      
      const error = new Error(errorMessage) as Error & { errorData?: unknown };
      error.errorData = errorData;
      throw error;
    }

    if (response.status === 204) {
      return null as T;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`API call to ${path} failed:`, error);
    throw error;
  }
}

export const api = {
  call,
};
