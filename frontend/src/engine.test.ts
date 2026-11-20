import { describe, expect, it } from "vitest";
import { initialState, parseDisplay, step, type Action, type Effect, type State } from "./engine";

function apply(actions: Action[], start: State = initialState): { state: State; effects: Effect[] } {
  const effects: Effect[] = [];
  let state = start;
  for (const action of actions) {
    const outcome = step(state, action);
    state = outcome.state;
    if (outcome.effect.type !== "none") {
      effects.push(outcome.effect);
    }
  }
  return { state, effects };
}

function digits(value: string): Action[] {
  return value.split("").map((part) =>
    part === "." ? { type: "decimal" } : { type: "digit", digit: part },
  );
}

describe("entry editing", () => {
  it("builds a decimal number and ignores a second dot", () => {
    const { state } = apply([...digits("12"), { type: "decimal" }, { type: "digit", digit: "5" }, { type: "decimal" }]);
    expect(state.display).toBe("12.5");
    expect(parseDisplay(state.display)).toBe(12.5);
  });

  it("replaces a leading zero and caps the entry at 12 digits", () => {
    const { state } = apply(digits(`0${"9".repeat(13)}`));
    expect(state.display).toBe("9".repeat(12));
  });

  it("toggles the sign of an entry", () => {
    const negative = apply([...digits("15"), { type: "sign" }]).state;
    expect(negative.display).toBe("-15");
    expect(apply([{ type: "sign" }], negative).state.display).toBe("15");
  });

  it("backspaces through an entry and ignores backspace after an operator", () => {
    const typed = apply(digits("12")).state;
    expect(apply([{ type: "backspace" }], typed).state.display).toBe("1");

    const armed = apply([...digits("12"), { type: "operator", op: "add" }]).state;
    expect(apply([{ type: "backspace" }], armed).state).toMatchObject({
      display: "12",
      pending: "add",
    });
  });

  it("starts a decimal from a finished result", () => {
    const finished = step(initialState, {
      type: "resolved",
      kind: "commit",
      value: 8,
      expression: "3 + 5",
      nextOp: null,
      clearPending: false,
    }).state;
    expect(apply([{ type: "decimal" }, { type: "digit", digit: "5" }], finished).state.display).toBe("0.5");
  });
});

describe("operations", () => {
  it("requests 2 + 3 and shows the service result", () => {
    const pending = apply([...digits("2"), { type: "operator", op: "add" }, ...digits("3"), { type: "equals" }]);
    expect(pending.effects).toEqual([
      {
        type: "calculate",
        kind: "commit",
        operation: "add",
        a: 2,
        b: 3,
        nextOp: null,
        clearPending: false,
      },
    ]);

    const done = step(pending.state, {
      type: "resolved",
      kind: "commit",
      value: 5,
      expression: "2 + 3",
      nextOp: null,
      clearPending: false,
    }).state;
    expect(done).toMatchObject({
      display: "5",
      exact: 5,
      pending: null,
      preview: "2 + 3",
      history: ["2 + 3"],
      locked: false,
    });
  });

  it("changes an operator before the second operand is typed", () => {
    const { state, effects } = apply([
      ...digits("8"),
      { type: "operator", op: "add" },
      { type: "operator", op: "subtract" },
    ]);
    expect(effects).toHaveLength(0);
    expect(state).toMatchObject({ pending: "subtract", accumulator: 8, preview: "8 −" });
  });

  it("evaluates left to right when operations are chained", () => {
    const chained = apply([
      ...digits("2"),
      { type: "operator", op: "add" },
      ...digits("3"),
      { type: "operator", op: "multiply" },
    ]);
    expect(chained.effects[0]).toMatchObject({
      operation: "add",
      a: 2,
      b: 3,
      nextOp: "multiply",
    });

    const armed = step(chained.state, {
      type: "resolved",
      kind: "commit",
      value: 5,
      expression: "2 + 3",
      nextOp: "multiply",
      clearPending: false,
    }).state;
    const product = apply([...digits("4"), { type: "equals" }], armed);
    expect(product.effects[0]).toMatchObject({ operation: "multiply", a: 5, b: 4 });
  });

  it("repeats the displayed number when equals is pressed immediately", () => {
    const { effects } = apply([...digits("2"), { type: "operator", op: "add" }, { type: "equals" }]);
    expect(effects[0]).toMatchObject({ operation: "add", a: 2, b: 2 });
  });

  it("keeps the raw quotient for the next operation", () => {
    const equals = apply([...digits("2"), { type: "operator", op: "divide" }, ...digits("3"), { type: "equals" }]);
    const resolved = step(equals.state, {
      type: "resolved",
      kind: "commit",
      value: 2 / 3,
      expression: "2 ÷ 3",
      nextOp: null,
      clearPending: false,
    }).state;
    const again = apply([{ type: "operator", op: "multiply" }, ...digits("3"), { type: "equals" }], resolved);
    expect(again.effects[0]).toMatchObject({ operation: "multiply", b: 3 });
    if (again.effects[0]?.type === "calculate") {
      expect(again.effects[0].a).toBeCloseTo(2 / 3);
    }
  });

  it("requests a power", () => {
    const { effects } = apply([
      ...digits("2"),
      { type: "operator", op: "power" },
      ...digits("8"),
      { type: "equals" },
    ]);
    expect(effects[0]).toMatchObject({ operation: "power", a: 2, b: 8 });
  });
});

describe("unary operations and errors", () => {
  it("requests a square root of the current entry", () => {
    const { effects } = apply([...digits("9"), { type: "sqrt" }]);
    expect(effects[0]).toMatchObject({
      operation: "sqrt",
      a: 9,
      clearPending: true,
      kind: "replace",
    });
  });

  it("cancels an operator that does not yet have a second operand", () => {
    const { effects, state } = apply([...digits("9"), { type: "operator", op: "add" }, { type: "sqrt" }]);
    expect(effects[0]).toMatchObject({ operation: "sqrt", a: 9, clearPending: true });
    const resolved = step(state, {
      type: "resolved",
      kind: "replace",
      value: 3,
      expression: "√9",
      nextOp: null,
      clearPending: true,
    }).state;
    expect(resolved).toMatchObject({ display: "3", pending: null, accumulator: null });
  });

  it("replaces only the second operand with its square root", () => {
    const pending = apply([
      ...digits("9"),
      { type: "operator", op: "add" },
      ...digits("16"),
      { type: "sqrt" },
    ]);
    expect(pending.effects[0]).toMatchObject({ operation: "sqrt", a: 16, clearPending: false });
    const replaced = step(pending.state, {
      type: "resolved",
      kind: "replace",
      value: 4,
      expression: "√16",
      nextOp: null,
      clearPending: false,
    }).state;
    const equals = step(replaced, { type: "equals" });
    expect(equals.effect).toMatchObject({ operation: "add", a: 9, b: 4 });
  });

  it("turns the entry into a percentage", () => {
    const { effects } = apply([...digits("50"), { type: "percent" }]);
    expect(effects[0]).toMatchObject({ operation: "percent", a: 50, clearPending: true });
    expect(effects[0]).not.toHaveProperty("b");
  });

  it("composes percent of the accumulator with the pending operation", () => {
    const percent = apply([
      ...digits("200"),
      { type: "operator", op: "add" },
      ...digits("10"),
      { type: "percent" },
    ]);
    expect(percent.effects[0]).toMatchObject({
      operation: "percent",
      a: 200,
      b: 10,
      clearPending: false,
    });
    const replaced = step(percent.state, {
      type: "resolved",
      kind: "replace",
      value: 20,
      expression: "10% of 200",
      nextOp: null,
      clearPending: false,
    }).state;
    expect(replaced.preview).toBe("200 + 20");
    const equals = step(replaced, { type: "equals" });
    expect(equals.effect).toMatchObject({ operation: "add", a: 200, b: 20 });
  });

  it("shows a service error and lets the next digit start over", () => {
    const pending = apply([
      ...digits("1"),
      { type: "operator", op: "divide" },
      ...digits("0"),
      { type: "equals" },
    ]);
    const failed = step(pending.state, { type: "failed", message: "division by zero" }).state;
    expect(failed).toMatchObject({ display: "Error", error: "division by zero", pending: null, locked: false });
    expect(apply([{ type: "digit", digit: "4" }], failed).state).toMatchObject({
      display: "4",
      error: null,
    });
  });

  it("ignores keypad input while a request is in flight", () => {
    const pending = apply([...digits("2"), { type: "operator", op: "add" }, ...digits("3"), { type: "equals" }]);
    const ignored = step(pending.state, { type: "digit", digit: "9" });
    expect(ignored.effect).toEqual({ type: "none" });
    expect(ignored.state.display).toBe(pending.state.display);
  });

  it("clears the entry without erasing the tape", () => {
    const withHistory = step(initialState, {
      type: "resolved",
      kind: "commit",
      value: 5,
      expression: "2 + 3",
      nextOp: null,
      clearPending: false,
    }).state;
    const cleared = step(withHistory, { type: "clear" }).state;
    expect(cleared).toMatchObject({ display: "0", history: ["2 + 3"], pending: null });
  });

  it("keeps the eight most recent expressions", () => {
    let state = initialState;
    for (let index = 0; index < 9; index += 1) {
      const requested = step(state, { type: "sqrt" });
      state = step(requested.state, {
        type: "resolved",
        kind: "replace",
        value: 1,
        expression: `item-${index}`,
        nextOp: null,
        clearPending: true,
      }).state;
    }
    expect(state.history).toHaveLength(8);
    expect(state.history[0]).toBe("item-8");
    expect(state.history[7]).toBe("item-1");
  });
});

describe("parseDisplay", () => {
  it("rejects blank and non-numeric readouts", () => {
    expect(parseDisplay("")).toBeNull();
    expect(parseDisplay("Error")).toBeNull();
    expect(parseDisplay("-")).toBeNull();
    expect(parseDisplay("-0")).toBe(-0);
  });
});
