// Тонкий клиент к API «Отклик».

const TOKEN_KEY = "otklik_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response) {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.error) || (typeof data === "string" ? data : "") || "Что-то пошло не так";
    throw new ApiError(res.status, msg);
  }
  return data;
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const api = {
  async get(path: string) {
    const res = await fetch(path, { headers: { ...authHeaders() } });
    return handle(res);
  },
  async post(path: string, body?: any) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async put(path: string, body?: any) {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    return handle(res);
  },
  async postForm(path: string, form: FormData) {
    const res = await fetch(path, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
    });
    return handle(res);
  },
};
