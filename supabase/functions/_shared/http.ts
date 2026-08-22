const DEFAULT_ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
function configuredOrigins() {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function assertAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;

  const allowed = configuredOrigins();
  if (!allowed.includes(origin)) {
    throw new ApiError(403, "origin_not_allowed", "This origin is not allowed.");
  }
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = configuredOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function json(req: Request, body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(req),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function options(req: Request) {
  assertAllowedOrigin(req);
  return new Response("ok", { headers: corsHeaders(req) });
}

export function errorResponse(req: Request, error: unknown) {
  if (error instanceof ApiError) {
    return json(req, { error: error.code, message: error.message }, error.status);
  }

  const safeError = error as { name?: unknown; code?: unknown };
  console.error(JSON.stringify({
    event: "edge_unhandled_error",
    name: String(safeError?.name ?? "Error").slice(0, 80),
    code: String(safeError?.code ?? "unknown").slice(0, 80),
  }));
  return json(req, {
    error: "internal_error",
    message: "The request could not be completed.",
  }, 500);
}

export function requireMethod(req: Request, method: "GET" | "POST") {
  if (req.method !== method) {
    throw new ApiError(405, "method_not_allowed", `Use ${method} for this endpoint.`);
  }
}
