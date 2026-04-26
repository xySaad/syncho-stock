FROM golang:1.25-alpine AS builder
RUN apk add --no-cache build-base pkgconf tesseract-ocr-dev leptonica-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o server .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-fra leptonica
ENV TESSDATA_PREFIX=/usr/share/tessdata
WORKDIR /root/
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
