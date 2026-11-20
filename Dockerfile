# One image serves the API and the built React app.
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.23-alpine AS backend
WORKDIR /src/backend
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/calculator ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=backend /out/calculator /app/calculator
COPY --from=frontend /src/frontend/dist /app/static
ENV PORT=8080 \
    STATIC_DIR=/app/static \
    ALLOWED_ORIGIN=*
EXPOSE 8080
USER nobody
ENTRYPOINT ["/app/calculator"]
