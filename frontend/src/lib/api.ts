import { diagnostic } from "./diagnostics";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
    diagnostic("api", `${status}:${code || "unknown"}:${requestId || ""}`);
  }
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: options.signal || AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(0, "暂时无法连接，内容已留在本机");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {}
  if (!response.ok)
    throw new ApiError(
      response.status,
      String(data.error || "操作未完成"),
      String(data.code || ""),
      data.details,
      String(data.requestId || ""),
    );
  return data as T;
}
export function post<T>(url: string, body: unknown) {
  return api<T>(url, { method: "POST", body: JSON.stringify(body) });
}
