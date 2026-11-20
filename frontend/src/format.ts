const SCIENTIFIC_PATTERN = /\.?0+e/;

// formatNumber renders a calculator readout. It is display-only; the raw value
// returned by the API is what gets sent on the next operation.
export function formatNumber(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    return Number.isFinite(value) ? "0" : "Error";
  }

  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1e12 || absolute < 1e-9)) {
    return value
      .toExponential(6)
      .replace(/\.0+e/, "e")
      .replace(/(\.\d*?)0+e/, "$1e")
      .replace(SCIENTIFIC_PATTERN, "e");
  }

  const text = value.toFixed(10).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}
