const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errObj = (data && typeof data === 'object' ? data : {}) as {
      error?: string;
      code?: string;
    };
    throw new ApiError(
      errObj.error || `Request failed (${response.status})`,
      response.status,
      errObj.code
    );
  }

  return data as T;
}

export function apiUploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}`, true);
    if (inMemoryToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${inMemoryToken}`);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(95, Math.round((ev.loaded / ev.total) * 90));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (onProgress) onProgress(100);
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as T);
      } else {
        const errObj = (parsed && typeof parsed === 'object' ? parsed : {}) as {
          error?: string;
          code?: string;
        };
        reject(
          new ApiError(
            errObj.error || `Upload failed (${xhr.status})`,
            xhr.status,
            errObj.code
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new ApiError('Network error while uploading file.', 0));
    };

    xhr.send(formData);
  });
}

export async function apiDownloadBlob(path: string, fallbackFileName: string): Promise<void> {
  const headers = new Headers();
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errMsg = `Download failed (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json?.error) errMsg = json.error;
    } catch {
      // ignore non-json error
    }
    throw new ApiError(errMsg, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const fileName = match ? match[1] : fallbackFileName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
