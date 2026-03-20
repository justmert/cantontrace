#!/usr/bin/env bash
# wait-for-it.sh — Wait for a TCP host:port to become available
#
# Usage: wait-for-it.sh host:port [-t timeout] [-- command args...]
#
# Based on https://github.com/vishnubob/wait-for-it (MIT License)
# Simplified for CantonTrace service dependency management.

set -e

WAITFORIT_TIMEOUT=30
WAITFORIT_HOST=""
WAITFORIT_PORT=""
WAITFORIT_QUIET=0
WAITFORIT_CHILD=0
WAITFORIT_CLI=()

echoerr() {
    if [ "$WAITFORIT_QUIET" -ne 1 ]; then
        echo "$@" 1>&2
    fi
}

usage() {
    cat << USAGE >&2
Usage:
    $(basename "$0") host:port [-t timeout] [-q] [-- command args...]

    -t TIMEOUT  Timeout in seconds (default: 30, 0 for no timeout)
    -q          Quiet mode — suppress status messages
    --          Execute command after the host:port is available
USAGE
    exit 1
}

wait_for() {
    if [ "$WAITFORIT_TIMEOUT" -gt 0 ]; then
        echoerr "$(basename "$0"): waiting $WAITFORIT_TIMEOUT seconds for $WAITFORIT_HOST:$WAITFORIT_PORT"
    else
        echoerr "$(basename "$0"): waiting for $WAITFORIT_HOST:$WAITFORIT_PORT without a timeout"
    fi

    local start_ts
    start_ts=$(date +%s)

    while :; do
        if [ "$(uname)" = "Darwin" ]; then
            # macOS: use /dev/tcp via bash or nc
            (echo -n > /dev/tcp/"$WAITFORIT_HOST"/"$WAITFORIT_PORT") >/dev/null 2>&1
        else
            # Linux: use /dev/tcp
            (echo -n > /dev/tcp/"$WAITFORIT_HOST"/"$WAITFORIT_PORT") >/dev/null 2>&1
        fi
        local result=$?

        if [ $result -eq 0 ]; then
            local end_ts
            end_ts=$(date +%s)
            echoerr "$(basename "$0"): $WAITFORIT_HOST:$WAITFORIT_PORT is available after $((end_ts - start_ts)) seconds"
            break
        fi

        local now_ts
        now_ts=$(date +%s)
        if [ "$WAITFORIT_TIMEOUT" -gt 0 ] && [ $((now_ts - start_ts)) -ge "$WAITFORIT_TIMEOUT" ]; then
            echoerr "$(basename "$0"): timeout after waiting $WAITFORIT_TIMEOUT seconds for $WAITFORIT_HOST:$WAITFORIT_PORT"
            return 1
        fi

        sleep 1
    done
    return 0
}

wait_for_wrapper() {
    if [ "$WAITFORIT_QUIET" -eq 1 ]; then
        wait_for 2>/dev/null
    else
        wait_for
    fi
}

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        *:*)
            WAITFORIT_HOST="${1%%:*}"
            WAITFORIT_PORT="${1##*:}"
            shift
            ;;
        -t)
            WAITFORIT_TIMEOUT="$2"
            if [ -z "$WAITFORIT_TIMEOUT" ]; then
                echoerr "Error: missing timeout value"
                usage
            fi
            shift 2
            ;;
        -q)
            WAITFORIT_QUIET=1
            shift
            ;;
        --)
            shift
            WAITFORIT_CLI=("$@")
            break
            ;;
        -h|--help)
            usage
            ;;
        *)
            echoerr "Unknown argument: $1"
            usage
            ;;
    esac
done

if [ -z "$WAITFORIT_HOST" ] || [ -z "$WAITFORIT_PORT" ]; then
    echoerr "Error: you must provide a host:port to wait for"
    usage
fi

wait_for_wrapper
WAITFORIT_RESULT=$?

if [ ${#WAITFORIT_CLI[@]} -gt 0 ]; then
    if [ $WAITFORIT_RESULT -ne 0 ]; then
        echoerr "$(basename "$0"): strict mode — refusing to execute subprocess"
        exit $WAITFORIT_RESULT
    fi
    exec "${WAITFORIT_CLI[@]}"
else
    exit $WAITFORIT_RESULT
fi
