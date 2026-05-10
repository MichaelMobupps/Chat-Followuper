/**
 * Thin fetch wrapper for dashboard → api-server calls.
 *
 * Why this exists alongside `@workspace/api-client-react`:
 * The api-client-react package is currently scoped to auth/health endpoints
 * driven by `@workspace/api-zod`. Routes like /api/campaigns and
 * /api/prospects/:id/generate-message follow the apollo-route convention
 * (inline TS types, no codegen). This helper matches that convention so
 * pages built today don't depend on codegen that hasn't been adopted broadly.
 *
 * If/when the codegen path is generalized, all consumers of this helper
 * can be migrated in one pass.
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string | null;
  public readonly body: unknown;

  constructor(
    status: number,
    code: string | null,
    message: string,
    body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

interface ServerErrorBody {
  error?: string;
  code?: string;
  message?: string;
  /** Array of field paths from a structured rejection (e.g. 409
   *  missing_fields, or surfaced from Zod issue paths). Auto-included
   *  in ApiError.message so debugging surfaces are self-explanatory. */
  fields?: string[];
}

function isErrorBody(value: unknown): value is ServerErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
/**
 * Extract field paths from a server error body for inclusion in the
 * thrown error's message string. Handles two common shapes:
 *   - { fields: ["country", "language"] } — our missing_fields style
 *   - { issues: [{ path: [...], message: "..." }] } — Zod's parse issues
 * Returns null when no field information is present, in which case the
 * thrown error keeps its base message (just the error code).
 */
function extractDetailFields(
  errBody: ServerErrorBody | null,
): string[] | null {
  if (!errBody) return null;
  if (Array.isArray(errBody.fields) && errBody.fields.length > 0) {
    return errBody.fields;
  }
  const anyBody = errBody as Record<string, unknown>;
  if (Array.isArray(anyBody.issues)) {
    const paths = (anyBody.issues as Array<{ path?: unknown[] }>)
      .map((i) =>
        Array.isArray(i.path) ? i.path.map(String).join(".") : "",
      )
      .filter(Boolean);
    if (paths.length > 0) return paths;
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (init?.body !== undefined && init.body !== null) {
    headers["Content-Type"] = "application/json";
  }
  if (init?.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }

  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } else {
    try {
      body = await res.text();
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const errBody = isErrorBody(body) ? body : null;
    const code = errBody?.code ?? errBody?.error ?? null;
    const baseMessage =
      errBody?.message ?? errBody?.error ?? `HTTP ${res.status}`;
    // Surface structured field detail when present so error.message is
    // self-explanatory (e.g. "missing_fields: country" instead of just
    // "missing_fields"). Saves a network-log dive on every schema-shaped
    // error. Added in Ticket fe-error-fields-surface.
    const detailFields = extractDetailFields(errBody);
    const message =
      detailFields && detailFields.length > 0
        ? `${baseMessage}: ${detailFields.join(", ")}`
        : baseMessage;
    throw new ApiError(res.status, code, message, body);
  }

  return body as T;
}
