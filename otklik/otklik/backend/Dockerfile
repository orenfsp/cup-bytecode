# --- build stage ---
FROM golang:1.23-alpine AS build
WORKDIR /app

# Кэшируем зависимости
COPY go.mod ./
COPY go.sum* ./
RUN go mod download || true

COPY . .
# go mod tidy на случай, если go.sum не полон; затем сборка
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /otklik ./cmd/server

# --- run stage ---
FROM alpine:3.20
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /otklik /app/otklik
COPY migrations /app/migrations
RUN mkdir -p /data/uploads && chown -R app /data
USER app
EXPOSE 8080
ENTRYPOINT ["/app/otklik"]
