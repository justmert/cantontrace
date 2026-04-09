# Canton Open-Source 3.4.11 Sandbox
#
# Downloads Canton from the official GitHub release (Apache 2.0 licensed).
# No dpm or enterprise license required.
#
# Build:  docker build -t cantontrace/canton-sandbox docker/canton/
# Run:    docker run -p 10000:10000 cantontrace/canton-sandbox

FROM eclipse-temurin:17-jre

LABEL maintainer="CantonTrace"
LABEL description="Canton Open-Source 3.4.11 Sandbox for CantonTrace"

ARG CANTON_VERSION=3.4.11

WORKDIR /canton

# Download and extract Canton open-source release from GitHub
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    curl -sSL "https://github.com/digital-asset/canton/releases/download/v${CANTON_VERSION}/canton-open-source-${CANTON_VERSION}.tar.gz" \
      | tar xz --strip-components=1 && \
    apt-get purge -y curl && apt-get autoremove -y && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add our sandbox config
COPY sandbox-v3.conf /canton/sandbox.conf

RUN mkdir -p /canton/log

EXPOSE 10000 10001 10002 10003 10004 10005

ENV JAVA_OPTS="-XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=75.0 \
  -XX:InitialRAMPercentage=50.0 \
  -XX:+UseG1GC \
  -XX:+ExitOnOutOfMemoryError \
  -Djava.security.egd=file:/dev/./urandom"

HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=20 \
  CMD bash -c '</dev/tcp/localhost/10000' || exit 1

ENTRYPOINT ["bin/canton", "sandbox", "--no-tty", "-c", "/canton/sandbox.conf"]
