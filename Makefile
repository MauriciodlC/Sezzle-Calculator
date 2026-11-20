.PHONY: test test-backend test-frontend coverage run-backend

GO ?= go

test: test-backend test-frontend

test-backend:
	cd backend && $(GO) test ./...

test-frontend:
	cd frontend && npm test

coverage:
	cd backend && $(GO) test ./... -coverprofile=coverage.out && $(GO) tool cover -func=coverage.out
	cd frontend && npm run coverage

run-backend:
	cd backend && $(GO) run ./cmd/server
