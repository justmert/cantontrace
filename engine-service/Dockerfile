# CantonTrace Engine Service — Multi-stage Docker build
#
# Stage 1: Build the fat JAR using sbt-assembly
# Stage 2: Run with a minimal JRE image
#
# Java 17+ is required by the Daml LF engine.

# =============================================================================
# Build stage
# =============================================================================
FROM eclipse-temurin:17-jdk AS builder

# Install sbt
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg && \
    echo "deb https://repo.scala-sbt.org/scalasbt/debian all main" | tee /etc/apt/sources.list.d/sbt.list && \
    curl -sL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x2EE0EA64E40A89B84B2DF73499E82A75642AC823" | apt-key add && \
    apt-get update && \
    apt-get install -y --no-install-recommends sbt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependency resolution by copying build files first
COPY build.sbt .
COPY project/build.properties project/
COPY project/plugins.sbt project/

# Resolve dependencies (this layer is cached until build files change)
RUN sbt update

# Copy source and build
COPY src/ src/

RUN sbt assembly

# =============================================================================
# Runtime stage
# =============================================================================
FROM eclipse-temurin:17-jre

LABEL maintainer="CantonTrace <team@cantontrace.dev>"
LABEL description="CantonTrace Engine Service — Daml-LF execution trace and simulation"

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r cantontrace && useradd -r -g cantontrace cantontrace

# Copy the fat JAR from the builder stage.
# sbt-assembly produces: target/scala-2.13/cantontrace-engine-assembly-0.1.0.jar
# Using the exact name avoids Docker COPY glob issues.
COPY --from=builder /app/target/scala-2.13/cantontrace-engine-assembly-0.1.0.jar app.jar

# Create log directory
RUN mkdir -p /app/logs && chown -R cantontrace:cantontrace /app

USER cantontrace

# Expose the service port
EXPOSE 3002

# JVM tuning for containerized environments
ENV JAVA_OPTS="-XX:+UseContainerSupport \
  -XX:MaxRAMPercentage=75.0 \
  -XX:InitialRAMPercentage=50.0 \
  -XX:+UseG1GC \
  -XX:+ExitOnOutOfMemoryError \
  -Djava.security.egd=file:/dev/./urandom"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
