const allowedOrigins = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "http://127.0.0.1:1420",
]);

export function hasValidBridgeToken(requestUrl: string, expectedToken: string): boolean {
  if (!expectedToken) return false;
  const token = new URL(requestUrl, "http://127.0.0.1").searchParams.get("token");
  return token === expectedToken;
}

export function allowedCorsOrigin(origin: string | undefined): string | null {
  return origin && allowedOrigins.has(origin) ? origin : null;
}
