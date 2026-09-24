import { describe, expect, it } from "vitest";
import { allowedCorsOrigin, hasValidBridgeToken } from "./security.js";

describe("bridge security", () => {
  it("accepts only the exact token carried by the request", () => {
    expect(hasValidBridgeToken("/api/tasks?token=secret", "secret")).toBe(true);
    expect(hasValidBridgeToken("/api/tasks?token=wrong", "secret")).toBe(false);
    expect(hasValidBridgeToken("/api/tasks", "secret")).toBe(false);
  });

  it("allows only app and local development origins", () => {
    expect(allowedCorsOrigin("tauri://localhost")).toBe("tauri://localhost");
    expect(allowedCorsOrigin("http://tauri.localhost")).toBe("http://tauri.localhost");
    expect(allowedCorsOrigin("http://127.0.0.1:1420")).toBe("http://127.0.0.1:1420");
    expect(allowedCorsOrigin("https://example.com")).toBeNull();
  });
});
