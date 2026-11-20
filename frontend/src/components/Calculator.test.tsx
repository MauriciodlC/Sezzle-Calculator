import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type CalculateResponse } from "../api";
import type { Operation } from "../engine";
import { Calculator, type CalculatorService } from "./Calculator";

function serviceWith(
  calculate: CalculatorService["calculate"],
  checkHealth: CalculatorService["checkHealth"] = async () => true,
): CalculatorService {
  return { calculate, checkHealth };
}

async function renderCalculator(service: CalculatorService) {
  const user = userEvent.setup();
  render(<Calculator service={service} />);
  await screen.findByText("Service connected");
  return user;
}

describe("Calculator", () => {
  it("shows a service result, keeps it on the tape, and clears the entry", async () => {
    let resolveCalc: ((value: CalculateResponse) => void) | undefined;
    const calculate = vi.fn(
      () =>
        new Promise<CalculateResponse>((resolve) => {
          resolveCalc = resolve;
        }),
    );
    const user = await renderCalculator(serviceWith(calculate));

    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "3" }));
    await user.click(screen.getByRole("button", { name: "Equals" }));

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByText("Calculating...")).toBeInTheDocument();

    await act(async () => {
      resolveCalc?.({ result: 5, operation: "add", expression: "2 + 3" });
    });

    expect(await screen.findByRole("status")).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
    expect(screen.getByRole("listitem")).toHaveTextContent("2 + 3");

    await user.click(screen.getByRole("button", { name: "All clear" }));
    expect(screen.getByRole("status")).toHaveTextContent("0");
    expect(screen.getByRole("listitem")).toHaveTextContent("2 + 3");
  });

  it("composes a percentage with the pending addition", async () => {
    const calculate = vi.fn(async (operation: Operation, a: number, b?: number) => {
      if (operation === "percent" && b !== undefined) {
        return { result: (a * b) / 100, operation, expression: `${b}% of ${a}` };
      }
      if (operation === "add" && b !== undefined) {
        return { result: a + b, operation, expression: `${a} + ${b}` };
      }
      throw new Error(`unexpected ${operation}`);
    });
    const user = await renderCalculator(serviceWith(calculate));

    for (const name of ["2", "0", "0", "Add", "1", "0", "Percent"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(await screen.findByRole("listitem")).toHaveTextContent("10% of 200");

    await user.click(screen.getByRole("button", { name: "Equals" }));
    expect(await screen.findByRole("status")).toHaveTextContent("220");
    expect(calculate).toHaveBeenNthCalledWith(1, "percent", 200, 10);
    expect(calculate).toHaveBeenNthCalledWith(2, "add", 200, 20);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("200 + 20");
    expect(items[1]).toHaveTextContent("10% of 200");
  });

  it("shows division by zero from the service", async () => {
    const calculate = vi.fn(async () => {
      throw new ApiError("division by zero", 400);
    });
    const user = await renderCalculator(serviceWith(calculate));

    await user.click(screen.getByRole("button", { name: "8" }));
    await user.click(screen.getByRole("button", { name: "Divide" }));
    await user.click(screen.getByRole("button", { name: "0" }));
    await user.click(screen.getByRole("button", { name: "Equals" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("division by zero");
    expect(screen.getByRole("status")).toHaveTextContent("Error");
    expect(calculate).toHaveBeenCalledWith("divide", 8, 0);
  });

  it("reports a network failure and accepts keyboard entry", async () => {
    const calculate = vi.fn(async () => {
      throw new Error("offline");
    });
    const user = await renderCalculator(serviceWith(calculate));

    await user.keyboard("6*7{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the calculator service");
    expect(calculate).toHaveBeenCalledWith("multiply", 6, 7);
  });

  it("marks the service unreachable when health fails", async () => {
    render(<Calculator service={serviceWith(vi.fn(), async () => false)} />);
    expect(await screen.findByText("Service unreachable")).toBeInTheDocument();
  });
});
