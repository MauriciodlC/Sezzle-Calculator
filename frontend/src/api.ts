import type { Operation } from "./engine";

export type CalculateResponse = {
  result: number;
  operation: string;
  expression: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
}

export async function calculate(
  operation: Operation,
  a: number,
  b?: number,
): Promise<CalculateResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/v1/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(b === undefined ? { operation, a } : { operation, a, b }),
    });
  } catch {
    throw new ApiError("Could not reach the calculator service", 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string" ? payload.error : "Request failed";
    throw new ApiError(message, response.status);
  }
  if (!isCalculateResponse(payload)) {
    throw new ApiError("Unexpected response from calculator service", response.status);
  }
  return payload;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase()}/health`);
    if (!response.ok) {
      return false;
    }
    const payload: unknown = await response.json();
    return isRecord(payload) && payload.status === "ok";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCalculateResponse(value: unknown): value is CalculateResponse {
  return (
    isRecord(value) &&
    typeof value.result === "number" &&
    Number.isFinite(value.result) &&
    typeof value.operation === "string" &&
    typeof value.expression === "string"
  );
}
