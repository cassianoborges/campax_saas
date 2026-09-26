const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003';
const TOKEN_KEY = 'campax_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Fired when the backend answers that the session must pick an empresa (e.g. the active one was suspended). */
export const ESCOLHER_EMPRESA_EVENT = 'campax:escolher-empresa';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) clearToken();

  const json = await res.json().catch(() => ({}));
  if (res.status === 403 && json?.code === 'escolher_empresa') window.dispatchEvent(new Event(ESCOLHER_EMPRESA_EVENT));
  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.error || `Erro ${res.status}`, res.status);
  }
  return json as T;
}

export const apiClient = {
  baseUrl: API_URL,
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),
};
