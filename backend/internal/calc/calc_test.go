package calc

import (
	"errors"
	"math"
	"testing"
)

func num(v float64) *float64 { return &v }

func TestEvaluate(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		op      Operation
		a       float64
		b       *float64
		want    float64
		expr    string
		wantErr error
	}{
		{name: "add", op: OpAdd, a: 2, b: num(3), want: 5, expr: "2 + 3"},
		{name: "add decimals", op: OpAdd, a: 0.1, b: num(0.2), want: 0.3, expr: "0.1 + 0.2"},
		{name: "subtract", op: OpSubtract, a: 10, b: num(4), want: 6, expr: "10 − 4"},
		{name: "subtract negative", op: OpSubtract, a: 3, b: num(8), want: -5, expr: "3 − 8"},
		{name: "multiply", op: OpMultiply, a: 6, b: num(7), want: 42, expr: "6 × 7"},
		{name: "divide", op: OpDivide, a: 7, b: num(2), want: 3.5, expr: "7 ÷ 2"},
		{name: "divide zero numerator", op: OpDivide, a: 0, b: num(5), want: 0, expr: "0 ÷ 5"},
		{name: "power", op: OpPower, a: 2, b: num(10), want: 1024, expr: "2 ^ 10"},
		{name: "zero to the zero", op: OpPower, a: 0, b: num(0), want: 1, expr: "0 ^ 0"},
		{name: "sqrt", op: OpSqrt, a: 9, want: 3, expr: "√9"},
		{name: "sqrt zero", op: OpSqrt, a: 0, want: 0, expr: "√0"},
		{name: "sqrt ignores b", op: OpSqrt, a: 4, b: num(100), want: 2, expr: "√4"},
		{name: "percent of", op: OpPercent, a: 200, b: num(15), want: 30, expr: "15% of 200"},
		{name: "percent unary", op: OpPercent, a: 50, want: 0.5, expr: "50%"},
		{name: "negative zero display", op: OpAdd, a: math.Copysign(0, -1), b: num(0), want: 0, expr: "0 + 0"},

		{name: "divide by zero", op: OpDivide, a: 1, b: num(0), wantErr: ErrDivisionByZero},
		{name: "negative sqrt", op: OpSqrt, a: -1, wantErr: ErrNegativeSqrt},
		{name: "missing operand", op: OpAdd, a: 1, wantErr: ErrMissingOperand},
		{name: "unknown operation", op: Operation("modulo"), a: 1, b: num(1), wantErr: ErrUnknownOperation},
		{name: "nan operand", op: OpAdd, a: math.NaN(), b: num(1), wantErr: ErrInvalidNumber},
		{name: "inf operand", op: OpMultiply, a: 1, b: num(math.Inf(1)), wantErr: ErrInvalidNumber},
		{name: "overflow", op: OpMultiply, a: 1e308, b: num(10), wantErr: ErrNonFinite},
		{name: "negative power of zero", op: OpPower, a: 0, b: num(-1), wantErr: ErrNonFinite},
		{name: "fractional power of negative", op: OpPower, a: -8, b: num(0.5), wantErr: ErrNonFinite},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := Evaluate(tc.op, tc.a, tc.b)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("error = %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if math.Abs(got.Value-tc.want) > 1e-9 {
				t.Fatalf("value = %v, want %v", got.Value, tc.want)
			}
			if got.Expression != tc.expr {
				t.Fatalf("expression = %q, want %q", got.Expression, tc.expr)
			}
		})
	}
}

func TestFormatFloatLargeAndTiny(t *testing.T) {
	t.Parallel()
	got, err := Evaluate(OpMultiply, 1e12, num(2))
	if err != nil {
		t.Fatal(err)
	}
	if got.Expression != "1e+12 × 2" {
		t.Fatalf("expression = %q", got.Expression)
	}

	got, err = Evaluate(OpDivide, 1, num(1e12))
	if err != nil {
		t.Fatal(err)
	}
	if got.Expression != "1 ÷ 1e+12" {
		t.Fatalf("expression = %q", got.Expression)
	}
	if math.Abs(got.Value-1e-12) > 1e-24 {
		t.Fatalf("value = %v", got.Value)
	}
}
