import { formatNumber } from "./format";

export type BinaryOp = "add" | "subtract" | "multiply" | "divide" | "power";
export type Operation = BinaryOp | "sqrt" | "percent";

export type State = {
  display: string;
  // exact keeps the raw API value so the next request is not parsed back out
  // of a rounded display string.
  exact: number | null;
  accumulator: number | null;
  pending: BinaryOp | null;
  overwrite: boolean;
  error: string | null;
  preview: string;
  history: string[];
  locked: boolean;
};

export const initialState: State = {
  display: "0",
  exact: null,
  accumulator: null,
  pending: null,
  overwrite: true,
  error: null,
  preview: "",
  history: [],
  locked: false,
};

export type CalculateEffect = {
  type: "calculate";
  kind: "commit" | "replace";
  operation: Operation;
  a: number;
  b?: number;
  nextOp: BinaryOp | null;
  clearPending: boolean;
};

export type Effect = { type: "none" } | CalculateEffect;

export type Action =
  | { type: "digit"; digit: string }
  | { type: "decimal" }
  | { type: "sign" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "operator"; op: BinaryOp }
  | { type: "equals" }
  | { type: "sqrt" }
  | { type: "percent" }
  | {
      type: "resolved";
      kind: "commit" | "replace";
      value: number;
      expression: string;
      nextOp: BinaryOp | null;
      clearPending: boolean;
    }
  | { type: "failed"; message: string };

const MAX_DIGITS = 12;
const MAX_HISTORY = 8;

const SYMBOL: Record<BinaryOp, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  power: "^",
};

// step edits the entry locally. Arithmetic leaves as a calculate effect;
// the UI performs that request and feeds the response back through resolved.
//
// Binary operations run left to right, the way a handheld calculator does.
// Square root and percent transform the entry on screen. Percent is special
// only when a second operand has been typed: it asks for b% of the accumulator
// and keeps the pending operation, so 200 + 10 % = becomes 200 + 20.
export function step(state: State, action: Action): { state: State; effect: Effect } {
  if (state.locked && action.type !== "resolved" && action.type !== "failed") {
    return { state, effect: { type: "none" } };
  }

  switch (action.type) {
    case "clear":
      return { state: { ...initialState, history: state.history }, effect: { type: "none" } };
    case "digit":
      return { state: enterDigit(state, action.digit), effect: { type: "none" } };
    case "decimal":
      return { state: enterDecimal(state), effect: { type: "none" } };
    case "sign":
      return { state: toggleSign(state), effect: { type: "none" } };
    case "backspace":
      return { state: backspace(state), effect: { type: "none" } };
    case "operator":
      return pressOperator(state, action.op);
    case "equals":
      return pressEquals(state);
    case "sqrt":
      return pressUnary(state, "sqrt");
    case "percent":
      return pressUnary(state, "percent");
    case "resolved":
      return { state: applyResolved(state, action), effect: { type: "none" } };
    case "failed":
      return {
        state: {
          ...state,
          display: "Error",
          exact: null,
          accumulator: null,
          pending: null,
          overwrite: true,
          locked: false,
          preview: "",
          error: action.message,
        },
        effect: { type: "none" },
      };
  }
}

export function parseDisplay(display: string): number | null {
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(display)) {
    return null;
  }
  const value = Number(display);
  return Number.isFinite(value) ? value : null;
}

function currentValue(state: State): number | null {
  if (state.exact !== null) {
    return state.exact;
  }
  return parseDisplay(state.display);
}

function fresh(state: State): State {
  if (!state.error) {
    return state;
  }
  return { ...initialState, history: state.history };
}

function digitCount(display: string): number {
  return display.replace(/[^0-9]/g, "").length;
}

function enterDigit(state: State, digit: string): State {
  if (!/^[0-9]$/.test(digit)) {
    return state;
  }
  const base = fresh(state);
  if (base.overwrite) {
    return { ...base, display: digit, exact: null, overwrite: false, error: null };
  }
  if (base.display === "0") {
    return { ...base, display: digit, exact: null, error: null };
  }
  if (base.display === "-0") {
    return { ...base, display: `-${digit}`, exact: null, error: null };
  }
  if (digitCount(base.display) >= MAX_DIGITS) {
    return base;
  }
  return { ...base, display: base.display + digit, exact: null, error: null };
}

function enterDecimal(state: State): State {
  const base = fresh(state);
  if (base.overwrite) {
    return { ...base, display: "0.", exact: null, overwrite: false, error: null };
  }
  if (base.display.includes(".")) {
    return base;
  }
  return { ...base, display: `${base.display}.`, exact: null, error: null };
}

function toggleSign(state: State): State {
  if (state.error) {
    return state;
  }
  if (state.exact !== null) {
    const next = Object.is(state.exact, -0) ? 0 : state.exact === 0 ? -0 : -state.exact;
    return {
      ...state,
      exact: next,
      display: Object.is(next, -0) ? "-0" : formatNumber(next),
    };
  }
  if (state.display.startsWith("-")) {
    const stripped = state.display.slice(1);
    return { ...state, display: stripped === "" ? "0" : stripped, exact: null };
  }
  if (state.display === "0") {
    return { ...state, display: "-0", overwrite: false, exact: null };
  }
  return { ...state, display: `-${state.display}`, exact: null };
}

function backspace(state: State): State {
  if (state.error) {
    return { ...initialState, history: state.history };
  }
  if (state.overwrite && state.pending) {
    return state;
  }
  if (state.overwrite) {
    return { ...state, display: "0", exact: null };
  }
  const next = state.display.slice(0, -1);
  if (next === "" || next === "-" || next === "0") {
    return { ...state, display: "0", exact: null, overwrite: true };
  }
  return { ...state, display: next, exact: null };
}

function pressOperator(state: State, op: BinaryOp): { state: State; effect: Effect } {
  if (state.error) {
    return { state, effect: { type: "none" } };
  }
  const current = currentValue(state);
  if (current === null) {
    return { state, effect: { type: "none" } };
  }

  if (state.pending && state.accumulator !== null && state.overwrite) {
    return {
      state: {
        ...state,
        pending: op,
        preview: preview(state.accumulator, op),
        error: null,
      },
      effect: { type: "none" },
    };
  }

  if (state.pending && state.accumulator !== null) {
    return {
      state: {
        ...state,
        preview: preview(state.accumulator, state.pending, current),
        locked: true,
        error: null,
      },
      effect: {
        type: "calculate",
        kind: "commit",
        operation: state.pending,
        a: state.accumulator,
        b: current,
        nextOp: op,
        clearPending: false,
      },
    };
  }

  return {
    state: {
      ...state,
      display: formatNumber(current),
      exact: current,
      accumulator: current,
      pending: op,
      overwrite: true,
      preview: preview(current, op),
      error: null,
    },
    effect: { type: "none" },
  };
}

function pressEquals(state: State): { state: State; effect: Effect } {
  if (state.error || !state.pending || state.accumulator === null) {
    return { state, effect: { type: "none" } };
  }
  const current = currentValue(state);
  if (current === null) {
    return { state, effect: { type: "none" } };
  }
  return {
    state: {
      ...state,
      preview: preview(state.accumulator, state.pending, current),
      locked: true,
      error: null,
    },
    effect: {
      type: "calculate",
      kind: "commit",
      operation: state.pending,
      a: state.accumulator,
      b: current,
      nextOp: null,
      clearPending: false,
    },
  };
}

function pressUnary(
  state: State,
  operation: "sqrt" | "percent",
): { state: State; effect: Effect } {
  if (state.error) {
    return { state, effect: { type: "none" } };
  }
  const current = currentValue(state);
  if (current === null) {
    return { state, effect: { type: "none" } };
  }

  const secondEntered = state.pending !== null && state.accumulator !== null && !state.overwrite;
  if (secondEntered && operation === "percent") {
    return lock(state, {
      type: "calculate",
      kind: "replace",
      operation: "percent",
      a: state.accumulator as number,
      b: current,
      nextOp: null,
      clearPending: false,
    });
  }
  if (secondEntered && operation === "sqrt") {
    return lock(state, {
      type: "calculate",
      kind: "replace",
      operation: "sqrt",
      a: current,
      nextOp: null,
      clearPending: false,
    });
  }
  if (operation === "percent") {
    return lock(state, {
      type: "calculate",
      kind: "replace",
      operation: "percent",
      a: current,
      nextOp: null,
      clearPending: true,
    });
  }
  return lock(state, {
    type: "calculate",
    kind: "replace",
    operation: "sqrt",
    a: current,
    nextOp: null,
    clearPending: true,
  });
}

function lock(state: State, effect: CalculateEffect): { state: State; effect: Effect } {
  return { state: { ...state, locked: true, error: null }, effect };
}

function applyResolved(state: State, action: Extract<Action, { type: "resolved" }>): State {
  const display = formatNumber(action.value);
  const history = action.expression
    ? [action.expression, ...state.history].slice(0, MAX_HISTORY)
    : state.history;

  if (action.kind === "commit" && action.nextOp) {
    return {
      ...state,
      display,
      exact: action.value,
      accumulator: action.value,
      pending: action.nextOp,
      overwrite: true,
      locked: false,
      error: null,
      preview: preview(action.value, action.nextOp),
      history,
    };
  }

  if (action.kind === "replace" && !action.clearPending) {
    return {
      ...state,
      display,
      exact: action.value,
      overwrite: true,
      locked: false,
      error: null,
      preview:
        state.pending && state.accumulator !== null
          ? preview(state.accumulator, state.pending, action.value)
          : action.expression,
      history,
    };
  }

  return {
    ...state,
    display,
    exact: action.value,
    accumulator: null,
    pending: null,
    overwrite: true,
    locked: false,
    error: null,
    preview: action.expression,
    history,
  };
}

function preview(a: number, op: BinaryOp, b?: number): string {
  const left = `${formatNumber(a)} ${SYMBOL[op]}`;
  return b === undefined ? left : `${left} ${formatNumber(b)}`;
}
