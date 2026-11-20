import type { Action, BinaryOp } from "../engine";

type Key = {
  id: string;
  label: string;
  ariaLabel: string;
  action: Action;
  variant: "digit" | "ghost" | "op" | "equals";
  wide?: boolean;
};

const KEYS: Key[] = [
  { id: "ac", label: "AC", ariaLabel: "All clear", action: { type: "clear" }, variant: "ghost" },
  { id: "bs", label: "⌫", ariaLabel: "Backspace", action: { type: "backspace" }, variant: "ghost" },
  { id: "pct", label: "%", ariaLabel: "Percent", action: { type: "percent" }, variant: "ghost" },
  { id: "div", label: "÷", ariaLabel: "Divide", action: { type: "operator", op: "divide" }, variant: "op" },
  { id: "7", label: "7", ariaLabel: "7", action: { type: "digit", digit: "7" }, variant: "digit" },
  { id: "8", label: "8", ariaLabel: "8", action: { type: "digit", digit: "8" }, variant: "digit" },
  { id: "9", label: "9", ariaLabel: "9", action: { type: "digit", digit: "9" }, variant: "digit" },
  { id: "mul", label: "×", ariaLabel: "Multiply", action: { type: "operator", op: "multiply" }, variant: "op" },
  { id: "4", label: "4", ariaLabel: "4", action: { type: "digit", digit: "4" }, variant: "digit" },
  { id: "5", label: "5", ariaLabel: "5", action: { type: "digit", digit: "5" }, variant: "digit" },
  { id: "6", label: "6", ariaLabel: "6", action: { type: "digit", digit: "6" }, variant: "digit" },
  { id: "sub", label: "−", ariaLabel: "Subtract", action: { type: "operator", op: "subtract" }, variant: "op" },
  { id: "1", label: "1", ariaLabel: "1", action: { type: "digit", digit: "1" }, variant: "digit" },
  { id: "2", label: "2", ariaLabel: "2", action: { type: "digit", digit: "2" }, variant: "digit" },
  { id: "3", label: "3", ariaLabel: "3", action: { type: "digit", digit: "3" }, variant: "digit" },
  { id: "add", label: "+", ariaLabel: "Add", action: { type: "operator", op: "add" }, variant: "op" },
  { id: "sign", label: "±", ariaLabel: "Toggle sign", action: { type: "sign" }, variant: "ghost" },
  { id: "0", label: "0", ariaLabel: "0", action: { type: "digit", digit: "0" }, variant: "digit" },
  { id: "dot", label: ".", ariaLabel: "Decimal point", action: { type: "decimal" }, variant: "digit" },
  { id: "eq", label: "=", ariaLabel: "Equals", action: { type: "equals" }, variant: "equals" },
  { id: "sqrt", label: "√", ariaLabel: "Square root", action: { type: "sqrt" }, variant: "ghost", wide: true },
  { id: "pow", label: "xʸ", ariaLabel: "Power", action: { type: "operator", op: "power" }, variant: "op", wide: true },
];

type KeypadProps = {
  disabled: boolean;
  pending: BinaryOp | null;
  onAction: (action: Action) => void;
};

export function Keypad({ disabled, pending, onAction }: KeypadProps) {
  return (
    <div className="keys">
      {KEYS.map((key) => {
        const pressed = key.action.type === "operator" && key.action.op === pending;
        return (
          <button
            key={key.id}
            type="button"
            className={`${key.variant}${key.wide ? " wide" : ""}`}
            aria-label={key.ariaLabel}
            aria-pressed={key.action.type === "operator" ? pressed : undefined}
            disabled={disabled}
            onClick={() => onAction(key.action)}
          >
            {key.label}
          </button>
        );
      })}
    </div>
  );
}
