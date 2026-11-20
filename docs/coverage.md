# Coverage

Generated from the unit tests in this repository. Regenerate with the commands in the README; do not treat this file as a substitute for running them.

## Backend

`go test ./... -coverprofile=coverage.out` and `go tool cover -func=coverage.out`

| Package | Statements |
| --- | --- |
| `calculator/internal/calc` | 92.3% |
| `calculator/internal/httpapi` | 94.0% |
| `calculator/cmd/server` | 0% |

`cmd/server` is the process entrypoint (`main`): it binds the port and handles shutdown. The behavior under test lives in `internal/calc` and `internal/httpapi`. Across all three packages the total is 84.5% of statements.

## Frontend

`npm run coverage` (Vitest, v8). Tests are excluded from the measurement.

| | |
| --- | --- |
| Statements | 91.0% (545/599) |
| Branches | 87.5% (168/192) |
| Functions | 100% (30/30) |

The entry engine, the HTTP client, and the keypad are covered. `main.tsx` is the browser bootstrap and is excluded.
