let memoryToken: string | null = null;
let unauthorizedHandler: ((code?: string, message?: string) => void) | null = null;

// Limpa eventual token antigo salvo em storage do navegador
try {
  localStorage.removeItem('cfc:auth_token');
} catch {
  /* ignora */
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function setUnauthorizedHandler(fn: ((code?: string, message?: string) => void) | null): void {
  unauthorizedHandler = fn;
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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (memoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `Erro na requisição (${res.status}).`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/first-access')) {
      memoryToken = null;
      unauthorizedHandler?.(code, msg);
    }
    throw new ApiError(msg, res.status, code);
  }

  return data as T;
}

export function trackEvent(type: 'recipe_view' | 'product_click' | 'referral_share', id?: string): void {
  void apiFetch('/api/analytics/event', {
    method: 'POST',
    body: JSON.stringify({ type, id }),
  }).catch(() => {
    /* silencioso */
  });
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem válido (PNG, JPG ou WebP).'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('A imagem deve ter no máximo 5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Não foi possível ler a imagem.'));
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
