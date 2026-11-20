// Package httpapi exposes the calculator as a small JSON API.
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"calculator/internal/calc"
)

// Config controls the process. Zero values are safe for tests.
type Config struct {
	Port          string
	AllowedOrigin string
	StaticDir     string
	MaxBodyBytes  int64
}

// LoadConfig reads environment variables used by cmd/server.
func LoadConfig() Config {
	return Config{
		Port:          envOr("PORT", "8080"),
		AllowedOrigin: envOr("ALLOWED_ORIGIN", "*"),
		StaticDir:     os.Getenv("STATIC_DIR"),
		MaxBodyBytes:  1 << 20,
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// NewHandler routes the API and, when StaticDir is set, the built frontend.
func NewHandler(cfg Config, logger *slog.Logger) http.Handler {
	if cfg.MaxBodyBytes <= 0 {
		cfg.MaxBodyBytes = 1 << 20
	}
	if cfg.AllowedOrigin == "" {
		cfg.AllowedOrigin = "*"
	}

	api := &handler{cfg: cfg, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", api.health)
	mux.HandleFunc("POST /api/v1/calculate", api.calculate)
	if cfg.StaticDir != "" {
		mux.Handle("GET /", spaHandler(cfg.StaticDir))
	}
	return logRequests(logger, cors(cfg.AllowedOrigin, mux))
}

type handler struct {
	cfg    Config
	logger *slog.Logger
}

type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Result     float64 `json:"result"`
	Operation  string  `json:"operation"`
	Expression string  `json:"expression"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type healthResponse struct {
	Status string `json:"status"`
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func (h *handler) calculate(w http.ResponseWriter, r *http.Request) {
	mediaType := r.Header.Get("Content-Type")
	if mediaType != "" && !strings.HasPrefix(strings.ToLower(mediaType), "application/json") {
		writeJSON(w, http.StatusUnsupportedMediaType, errorResponse{Error: "content type must be application/json"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.cfg.MaxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	var req calculateRequest
	if err := decoder.Decode(&req); err != nil {
		status, message := decodeError(err)
		writeJSON(w, status, errorResponse{Error: message})
		return
	}
	if decoder.More() {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid JSON"})
		return
	}

	if strings.TrimSpace(req.Operation) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "operation is required"})
		return
	}
	if req.A == nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "operand a is required"})
		return
	}

	result, err := calc.Evaluate(calc.Operation(req.Operation), *req.A, req.B)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, calculateResponse{
		Result:     result.Value,
		Operation:  req.Operation,
		Expression: result.Expression,
	})
}

func decodeError(err error) (int, string) {
	var maxBytes *http.MaxBytesError
	if errors.As(err, &maxBytes) {
		return http.StatusRequestEntityTooLarge, "request body too large"
	}
	var syntax *json.SyntaxError
	if errors.As(err, &syntax) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return http.StatusBadRequest, "invalid JSON"
	}
	return http.StatusBadRequest, "invalid JSON"
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func cors(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func logRequests(logger *slog.Logger, next http.Handler) http.Handler {
	if logger == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"duration", time.Since(start).String(),
		)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(status int) {
	s.status = status
	s.ResponseWriter.WriteHeader(status)
}

func spaHandler(dir string) http.Handler {
	indexPath := filepath.Join(dir, "index.html")
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		rel := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if rel == "" || rel == "." {
			http.ServeFile(w, r, indexPath)
			return
		}
		full, ok := within(dir, rel)
		if !ok {
			http.NotFound(w, r)
			return
		}
		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			http.ServeFile(w, r, indexPath)
			return
		}
		files.ServeHTTP(w, r)
	})
}

func within(root, rel string) (string, bool) {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", false
	}
	full := filepath.Join(rootAbs, filepath.FromSlash(rel))
	fullAbs, err := filepath.Abs(full)
	if err != nil {
		return "", false
	}
	sep := string(os.PathSeparator)
	if fullAbs != rootAbs && !strings.HasPrefix(fullAbs, rootAbs+sep) {
		return "", false
	}
	return fullAbs, true
}
