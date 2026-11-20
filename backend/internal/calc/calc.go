// Package calc evaluates calculator operations. It has no I/O, so the rules
// can be tested without an HTTP server.
package calc

import (
	"errors"
	"math"
	"strconv"
	"strings"
)

// Operation names are part of the public API contract.
type Operation string

const (
	OpAdd      Operation = "add"
	OpSubtract Operation = "subtract"
	OpMultiply Operation = "multiply"
	OpDivide   Operation = "divide"
	OpPower    Operation = "power"
	OpSqrt     Operation = "sqrt"
	OpPercent  Operation = "percent"
)

var (
	ErrDivisionByZero   = errors.New("division by zero")
	ErrNegativeSqrt     = errors.New("square root of a negative number is not defined")
	ErrMissingOperand   = errors.New("operand b is required for this operation")
	ErrUnknownOperation = errors.New("unsupported operation")
	ErrInvalidNumber    = errors.New("operands must be finite numbers")
	ErrNonFinite        = errors.New("result is not a finite number")
)

// Result is a successful evaluation. Expression is a display string, not an
// input format; clients should not try to parse it.
type Result struct {
	Value      float64
	Expression string
}

// Evaluate runs one operation.
//
// b is required for add, subtract, multiply, divide, and power.
// sqrt ignores b. percent treats a missing b as "a percent" (a / 100) and a
// present b as "b percent of a" (a * b / 100).
//
// 0^0 is 1, matching math.Pow. Overflow and other non-finite results are errors.
func Evaluate(op Operation, a float64, b *float64) (Result, error) {
	if !isFinite(a) || (b != nil && !isFinite(*b)) {
		return Result{}, ErrInvalidNumber
	}

	var (
		value float64
		expr  string
	)

	switch op {
	case OpAdd:
		if err := requireB(b); err != nil {
			return Result{}, err
		}
		value = a + *b
		expr = formatFloat(a) + " + " + formatFloat(*b)
	case OpSubtract:
		if err := requireB(b); err != nil {
			return Result{}, err
		}
		value = a - *b
		expr = formatFloat(a) + " − " + formatFloat(*b)
	case OpMultiply:
		if err := requireB(b); err != nil {
			return Result{}, err
		}
		value = a * *b
		expr = formatFloat(a) + " × " + formatFloat(*b)
	case OpDivide:
		if err := requireB(b); err != nil {
			return Result{}, err
		}
		if *b == 0 {
			return Result{}, ErrDivisionByZero
		}
		value = a / *b
		expr = formatFloat(a) + " ÷ " + formatFloat(*b)
	case OpPower:
		if err := requireB(b); err != nil {
			return Result{}, err
		}
		value = math.Pow(a, *b)
		expr = formatFloat(a) + " ^ " + formatFloat(*b)
	case OpSqrt:
		if a < 0 {
			return Result{}, ErrNegativeSqrt
		}
		value = math.Sqrt(a)
		expr = "√" + formatFloat(a)
	case OpPercent:
		if b == nil {
			value = a / 100
			expr = formatFloat(a) + "%"
		} else {
			value = a * (*b) / 100
			expr = formatFloat(*b) + "% of " + formatFloat(a)
		}
	default:
		return Result{}, ErrUnknownOperation
	}

	if !isFinite(value) {
		return Result{}, ErrNonFinite
	}
	return Result{Value: value, Expression: expr}, nil
}

func requireB(b *float64) error {
	if b == nil {
		return ErrMissingOperand
	}
	return nil
}

func isFinite(n float64) bool {
	return !math.IsNaN(n) && !math.IsInf(n, 0)
}

func formatFloat(f float64) string {
	if f == 0 {
		return "0"
	}
	abs := math.Abs(f)
	if abs >= 1e12 || abs < 1e-9 {
		return strconv.FormatFloat(f, 'g', 6, 64)
	}
	s := strconv.FormatFloat(f, 'f', 10, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	return s
}
