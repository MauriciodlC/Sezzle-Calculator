import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, calculate, checkHealth } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("calculate", () => {
  it("posts both operands", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ result: 5, operation: "add", expression: "2 + 3" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(calculate("add", 2, 3)).resolves.toEqual({
      result: 5,
      operation: "add",
      expression: "2 + 3",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/calculate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ operation: "add", a: 2, b: 3 });
  });

  it("omits b for a unary operation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ result: 3, operation: "sqrt", expression: "√9" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await calculate("sqrt", 9);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ operation: "sqrt", a: 9 });
  });

  it("uses VITE_API_BASE when the UI is not served by the API", async () => {
    vi.stubEnv("VITE_API_BASE", "http://localhost:8080/");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ result: 1, operation: "sqrt", expression: "√1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await calculate("sqrt", 1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/api/v1/calculate");
  });

  it("surfaces an API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "division by zero" }, 400)),
    );
    await expect(calculate("divide", 1, 0)).rejects.toMatchObject({
      message: "division by zero",
      status: 400,
    });
  });

  it("reports a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(calculate("add", 1, 1)).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a malformed success payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ result: "5" })));
    await expect(calculate("add", 1, 1)).rejects.toMatchObject({
      message: "Unexpected response from calculator service",
    });
  });

  it("uses a generic message when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(calculate("add", 1, 1)).rejects.toMatchObject({
      message: "Request failed",
      status: 500,
    });
  });
});

describe("checkHealth", () => {
  it("accepts a healthy service", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "ok" })));
    await expect(checkHealth()).resolves.toBe(true);
  });

  it("rejects an unhealthy or unreachable service", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "down" })));
    await expect(checkHealth()).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(checkHealth()).resolves.toBe(false);
  });
});
