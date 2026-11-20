package httpapi

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("ALLOWED_ORIGIN", "http://example.com")
	t.Setenv("STATIC_DIR", "dist")

	cfg := LoadConfig()
	if cfg.Port != "9090" || cfg.AllowedOrigin != "http://example.com" || cfg.StaticDir != "dist" {
		t.Fatalf("config = %+v", cfg)
	}
	if cfg.MaxBodyBytes != 1<<20 {
		t.Fatalf("max body = %d", cfg.MaxBodyBytes)
	}

	t.Setenv("PORT", "")
	t.Setenv("ALLOWED_ORIGIN", "")
	t.Setenv("STATIC_DIR", "")
	cfg = LoadConfig()
	if cfg.Port != "8080" || cfg.AllowedOrigin != "*" || cfg.StaticDir != "" {
		t.Fatalf("defaults = %+v", cfg)
	}
}

func TestHealthAndCORS(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	handler := NewHandler(Config{AllowedOrigin: "http://localhost:5173"}, logger)

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("allow origin = %q", got)
	}
	var body healthResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" {
		t.Fatalf("status body = %+v", body)
	}
	if !strings.Contains(logs.String(), "/health") {
		t.Fatalf("log = %s", logs.String())
	}

	preflight := httptest.NewRequest(http.MethodOptions, "/api/v1/calculate", nil)
	preflightResponse := httptest.NewRecorder()
	handler.ServeHTTP(preflightResponse, preflight)
	if preflightResponse.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d", preflightResponse.Code)
	}
}

func TestCalculate(t *testing.T) {
	handler := NewHandler(Config{AllowedOrigin: "*"}, nil)

	t.Run("success", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"add","a":2,"b":3}`, "application/json")
		if body.Code != http.StatusOK {
			t.Fatalf("status = %d body = %s", body.Code, body.Body.String())
		}
		var payload calculateResponse
		decode(t, body, &payload)
		if payload.Result != 5 || payload.Operation != "add" || payload.Expression != "2 + 3" {
			t.Fatalf("payload = %+v", payload)
		}
	})

	t.Run("charset content type", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"sqrt","a":9}`, "application/json; charset=utf-8")
		if body.Code != http.StatusOK {
			t.Fatalf("status = %d body = %s", body.Code, body.Body.String())
		}
		var payload calculateResponse
		decode(t, body, &payload)
		if payload.Result != 3 || payload.Expression != "√9" {
			t.Fatalf("payload = %+v", payload)
		}
	})

	t.Run("division by zero", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"divide","a":1,"b":0}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "division by zero")
	})

	t.Run("missing operation", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"a":1,"b":2}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "operation is required")
	})

	t.Run("missing operand", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"add","a":1}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "operand b is required for this operation")
	})

	t.Run("missing a", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"sqrt"}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "operand a is required")
	})

	t.Run("unknown field", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"add","a":1,"b":2,"extra":true}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "invalid JSON")
	})

	t.Run("invalid json", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{`, "application/json")
		assertError(t, body, http.StatusBadRequest, "invalid JSON")
	})

	t.Run("trailing value", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"add","a":1,"b":2}{"a":1}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "invalid JSON")
	})

	t.Run("wrong content type", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"add","a":1,"b":2}`, "text/plain")
		assertError(t, body, http.StatusUnsupportedMediaType, "content type must be application/json")
	})

	t.Run("wrong method", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/calculate", nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusMethodNotAllowed {
			t.Fatalf("status = %d", response.Code)
		}
	})

	t.Run("negative square root", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"sqrt","a":-4}`, "application/json")
		assertError(t, body, http.StatusBadRequest, "square root of a negative number is not defined")
	})

	t.Run("percent", func(t *testing.T) {
		body := post(t, handler, "/api/v1/calculate", `{"operation":"percent","a":200,"b":10}`, "application/json")
		if body.Code != http.StatusOK {
			t.Fatalf("status = %d", body.Code)
		}
		var payload calculateResponse
		decode(t, body, &payload)
		if math.Abs(payload.Result-20) > 1e-9 || payload.Expression != "10% of 200" {
			t.Fatalf("payload = %+v", payload)
		}
	})
}

func TestRequestTooLarge(t *testing.T) {
	handler := NewHandler(Config{AllowedOrigin: "*", MaxBodyBytes: 8}, nil)
	body := post(t, handler, "/api/v1/calculate", `{"operation":"add","a":1,"b":2}`, "application/json")
	assertError(t, body, http.StatusRequestEntityTooLarge, "request body too large")
}

func TestAPIOnlyRootIsNotFound(t *testing.T) {
	handler := NewHandler(Config{AllowedOrigin: "*"}, nil)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestStaticFiles(t *testing.T) {
	root := t.TempDir()
	staticDir := filepath.Join(root, "static")
	if err := os.Mkdir(staticDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte("INDEX"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "app.js"), []byte("console.log(1)"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "secret.txt"), []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := NewHandler(Config{AllowedOrigin: "*", StaticDir: staticDir}, nil)

	index := httptest.NewRecorder()
	handler.ServeHTTP(index, httptest.NewRequest(http.MethodGet, "/", nil))
	if index.Body.String() != "INDEX" {
		t.Fatalf("index = %q", index.Body.String())
	}

	script := httptest.NewRecorder()
	handler.ServeHTTP(script, httptest.NewRequest(http.MethodGet, "/app.js", nil))
	if script.Body.String() != "console.log(1)" {
		t.Fatalf("script = %q", script.Body.String())
	}

	fallback := httptest.NewRecorder()
	handler.ServeHTTP(fallback, httptest.NewRequest(http.MethodGet, "/calculator", nil))
	if fallback.Body.String() != "INDEX" {
		t.Fatalf("fallback = %q", fallback.Body.String())
	}

	escape := httptest.NewRecorder()
	handler.ServeHTTP(escape, httptest.NewRequest(http.MethodGet, "/../secret.txt", nil))
	if strings.Contains(escape.Body.String(), "SECRET") {
		t.Fatal("path traversal served a file outside the static directory")
	}

	apiMiss := httptest.NewRecorder()
	handler.ServeHTTP(apiMiss, httptest.NewRequest(http.MethodGet, "/api/unknown", nil))
	if apiMiss.Code != http.StatusNotFound || strings.Contains(apiMiss.Body.String(), "INDEX") {
		t.Fatalf("api miss = %d %q", apiMiss.Code, apiMiss.Body.String())
	}
}

func post(t *testing.T, handler http.Handler, target, payload, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, target, strings.NewReader(payload))
	request.Header.Set("Content-Type", contentType)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decode(t *testing.T, response *httptest.ResponseRecorder, dest any) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), dest); err != nil {
		t.Fatal(err)
	}
}

func assertError(t *testing.T, response *httptest.ResponseRecorder, status int, message string) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d, body = %s", response.Code, status, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Error != message {
		t.Fatalf("error = %q, want %q", payload.Error, message)
	}
	if ct := response.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content type = %q", ct)
	}
}
