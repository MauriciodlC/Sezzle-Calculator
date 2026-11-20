import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, calculate, checkHealth } from "../api";
import {
  initialState,
  step,
  type Action,
  type BinaryOp,
  type State,
} from "../engine";
import { Keypad } from "./Keypad";

export type CalculatorService = {
  calculate: typeof calculate;
  checkHealth: () => Promise<boolean>;
};

const defaultService: CalculatorService = { calculate, checkHealth };

const KEY_OPS: Record<string, BinaryOp> = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
  "^": "power",
};

type CalculatorProps = {
  service?: CalculatorService;
};

export function Calculator({ service = defaultService }: CalculatorProps) {
  const [state, setState] = useState<State>(initialState);
  const [online, setOnline] = useState<boolean | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback(
    async (action: Action) => {
      const outcome = step(stateRef.current, action);
      stateRef.current = outcome.state;
      setState(outcome.state);
      if (outcome.effect.type !== "calculate") {
        return;
      }

      const effect = outcome.effect;
      try {
        const response = await service.calculate(effect.operation, effect.a, effect.b);
        const applied = step(outcome.state, {
          type: "resolved",
          kind: effect.kind,
          value: response.result,
          expression: response.expression,
          nextOp: effect.nextOp,
          clearPending: effect.clearPending,
        });
        stateRef.current = applied.state;
        setState(applied.state);
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : "Could not reach the calculator service";
        const applied = step(outcome.state, { type: "failed", message });
        stateRef.current = applied.state;
        setState(applied.state);
      }
    },
    [service],
  );

  useEffect(() => {
    let live = true;
    const ping = () => {
      service.checkHealth().then((ok) => {
        if (live) {
          setOnline(ok);
        }
      });
    };
    ping();
    const timer = window.setInterval(ping, 5000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [service]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const key = event.key;
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        void dispatch({ type: "digit", digit: key });
        return;
      }
      const operation = KEY_OPS[key];
      if (operation) {
        event.preventDefault();
        void dispatch({ type: "operator", op: operation });
        return;
      }
      if (key === ".") {
        void dispatch({ type: "decimal" });
        return;
      }
      if (key === "Enter" || key === "=") {
        event.preventDefault();
        void dispatch({ type: "equals" });
        return;
      }
      if (key === "Escape") {
        void dispatch({ type: "clear" });
        return;
      }
      if (key === "Backspace") {
        event.preventDefault();
        void dispatch({ type: "backspace" });
        return;
      }
      if (key === "%") {
        void dispatch({ type: "percent" });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const statusText =
    online === null ? "Checking service" : online ? "Service connected" : "Service unreachable";

  return (
    <div className="app">
      <header className="mast">
        <p className="eyebrow">Desk instrument</p>
        <h1>Calculator</h1>
        <p className="lede">
          Addition, powers, roots, and percentages are computed by the service. The keypad only edits
          the entry that gets sent.
        </p>
        <p className={`status${online === true ? " ok" : online === false ? " bad" : ""}`}>{statusText}</p>
      </header>

      <div className="layout">
        <section className="device" aria-label="Calculator" aria-busy={state.locked}>
          <div className="display">
            <p className="preview">{state.preview || "Ready"}</p>
            <p className={`readout${state.error ? " readout-error" : ""}`} role="status">
              {state.display}
            </p>
            <p className={`message${state.error ? " error" : ""}`} role={state.error ? "alert" : undefined}>
              {state.error ?? (state.locked ? "Calculating..." : "\u00a0")}
            </p>
          </div>
          <Keypad disabled={state.locked} pending={state.pending} onAction={(action) => void dispatch(action)} />
        </section>

        <aside className="tape" aria-label="Calculation tape">
          <h2>Tape</h2>
          {state.history.length === 0 ? (
            <p className="tape-empty">Completed calculations will appear here.</p>
          ) : (
            <ol>
              {state.history.map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ol>
          )}
          <p className="hint">Keyboard: digits, + − * / ^, Enter, Esc, Backspace, %</p>
        </aside>
      </div>
    </div>
  );
}
