FROM alpine:3.19

RUN apk add --no-cache bash curl jq coreutils

# Install grpcurl - detect architecture
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
      GRPC_ARCH="linux_arm64"; \
    else \
      GRPC_ARCH="linux_x86_64"; \
    fi && \
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.9.1/grpcurl_1.9.1_${GRPC_ARCH}.tar.gz" \
      | tar xz -C /usr/local/bin/

COPY docker/demo/seed-demo.sh /demo/seed-demo.sh
COPY test-fixtures/test-daml/.daml/dist/cantontrace-test-1.0.0.dar /demo/cantontrace-test-1.0.0.dar

RUN chmod +x /demo/seed-demo.sh

ENTRYPOINT ["/demo/seed-demo.sh"]
