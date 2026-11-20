# Prompts

I used Cursor as an assistant. I kept the decisions and reviewed the diffs.

## 1. Agree the shape before writing code

Don't write files yet. I need a calculator with a React TypeScript keypad and a Go API. The keypad must not do the arithmetic itself. Every result has to come from the server.

Propose a layout and an API, then stop. I want one calculation function with no HTTP in it, and a thin handler on top, so both can be unit tested. Prefer the standard library on the Go side. No accounts, no stored history.

Call out anything you are assuming, especially percentage and what `2 + 3 × 4` should mean.

## 2. Lock the decisions

Use the plan, with these choices:

- One route, `POST /api/v1/calculate`, body `{ operation, a, b }`. `b` is required for add, subtract, multiply, divide, and power. Square root ignores `b`. Percent is `a / 100` when `b` is omitted, and `b` percent of `a` when `b` is present.
- Left to right, like a handheld calculator, not school-order precedence. `2 + 3 × 4` is 20. Document that.
- `200 + 10 % =` is two requests: percent of 200 is 20, then add 20. The pending add stays armed.
- Division by zero, square root of a negative, and non-finite results are errors, not Infinity.
- `0^0` can follow `math.Pow` and return 1. Say so in the README.
- Digits, backspace, the decimal point, and the sign toggle stay in the browser. They edit the entry. They are not results.
- Float64 on both sides. Keep the raw API number for the next request so a rounded display is not parsed back into the following call.

## 3. Backend calculation only

Implement `backend/internal/calc` and table tests. No server yet.

Cover add, subtract, multiply, divide, power, square root, and both percent forms. Also division by zero, missing `b`, a negative root, NaN and infinity inputs, overflow, and `0^0`. Return a short expression string (`2 + 3`, `√9`, `10% of 200`) from the same function. Do not format by rounding the value into a different number.

## 4. HTTP adapter

Add `internal/httpapi` and `cmd/server`. Keep `main` small: config from the environment, timeouts, and shutdown on interrupt.

The handler should reject a wrong content type, unknown JSON fields, a missing operation, a missing `a`, and a body over 1 MiB. Map calculator errors to 400 with `{ "error": "..." }`. Add `GET /health`. CORS is allowed because this service stores nothing. When `STATIC_DIR` is set, serve that directory and fall back to `index.html`, but do not let `/api/` miss and return the page, and do not allow paths to escape the directory.

Test the handler with `httptest`. Do not bind a real port in tests.

## 5. Keypad rules before any components

Write `frontend/src/engine.ts` as a pure `step(state, action)`. It may edit the display. If it needs arithmetic, it returns a calculate effect and does not compute the result. The UI will call the API and send the response back as another action.

Please cover these in tests, not in a component yet:

- `12.5` ignores a second decimal and stops at 12 digits
- `8 + −` only changes the operator
- `2 + 3 ×` commits the add, then arms multiply
- `2 + =` sends `2 + 2`
- `9 + √` cancels the add. `9 + 16 √ =` replaces only 16
- `200 + 10 % =` is the two-call sequence from the plan
- a failed request shows the message and the next digit starts clean
- input is ignored while a request is in flight
- clear keeps the tape
- after `2 / 3`, multiplying by 3 uses the raw quotient, not the rounded readout

## 6. Client and screen

Now the UI. `api.ts` posts to `/api/v1/calculate` and treats a non-OK body, a network failure, and a malformed payload as errors. `Calculator` performs the effect from `step` and passes the service in as a prop so tests can fake it.

The screen needs a readout, a tape of the server expressions, and a status that checks `/health`. Keys: AC, backspace, percent, the four operations, digits, sign, decimal, equals, square root, and power. Keyboard for digits, `+ − * / ^`, Enter, Esc, Backspace, and `%`.

Keep the styling in one CSS file. It should read as a desk instrument, not a purple gradient. It has to work as one column on a phone, with keys at least 44px. Component tests should click `2 + 3`, the percent sequence, division by zero, and a thrown network error.

## 7. Review, don't extend

Read the handler and the engine. Do not add operations. Tell me if a result can be produced without the API, if a path can leave the static directory, or if the next operation resends a rounded display string. Fix only those. Then add the README: how to run both processes, curl examples, the percent and precedence rules, and the float64 assumption. Add a Dockerfile and compose file that build the UI and serve it from the Go process. Add the commands for the coverage reports.

## 8. Check it the way a user would

Start the API and the Vite app. In the browser, run `2 + 3`, `8 ÷ 0`, `√9`, `200 + 10 %`, and `2 ^ 8` from the keyboard. Confirm the tape shows the server expressions and that a narrow viewport stacks the tape under the keypad. Fix anything that fails. Do not add features while doing that.
