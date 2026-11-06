// Browser-side API client. Every request goes through here, so 401/403/409
// all arrive as an ApiFailure with the HTTP status and a readable message.

export class ApiFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
  }
}

export const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { cache: "no-store", credentials: "same-origin", ...init });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiFailure(0, "NETWORK", "The app could not reach the server. Check that it is still running and try again.");
  }
  let data: { message?: string; code?: string } | null = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON responses fall through to the generic message below.
  }
  if (!response.ok)
    throw new ApiFailure(
      response.status,
      data?.code ?? "ERROR",
      data?.message ?? `The request failed (HTTP ${response.status}). Please try again.`,
    );
  return data as T;
}

export const postJson = <T,>(path: string, body: unknown, init?: RequestInit) =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
