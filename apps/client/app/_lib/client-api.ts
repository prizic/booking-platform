/**
 * Browser calls to the Client's own route handlers. A refused request carries
 * a stable error code in `{ error: { code } }`; anything unreadable, including
 * a network failure, is the generic `availability_unavailable`.
 */
export class ClientApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ClientApiError";
  }
}

export const unavailableCode = "availability_unavailable";

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const code =
      typeof body === "object" && body !== null
        ? ((body as { error?: { code?: unknown } }).error?.code ?? null)
        : null;
    return typeof code === "string" ? code : unavailableCode;
  } catch {
    return unavailableCode;
  }
}

/** POSTs JSON without cookies and returns the parsed body, or throws ClientApiError. */
export async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new ClientApiError(await readErrorCode(response));
  return response.json();
}

export function errorCodeOf(error: unknown): string {
  return error instanceof ClientApiError ? error.code : unavailableCode;
}
