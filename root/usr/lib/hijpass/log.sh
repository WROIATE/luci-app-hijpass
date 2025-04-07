#!/bin/sh

LOG_FILE="/tmp/hijpass.log"
MAX_SIZE=$((1024 * 1024)) # 1MB
LOG_LEVEL="info"          # debug, info, warn, error

LOG_LEVELS="debug:1 info:2 warn:3 error:4"

get_log_level_num() {
    level=$1
    echo "$LOG_LEVELS" | tr ' ' '\n' | grep "^$level:" | cut -d':' -f2
}

check_log_size() {
    if [ -f "$LOG_FILE" ]; then
        size=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE")
        if [ "$size" -gt "$MAX_SIZE" ]; then
            tmp_file="${LOG_FILE}.tmp"
            tail -n 100 "$LOG_FILE" >"$tmp_file"
            mv "$tmp_file" "$LOG_FILE"
        fi
    fi
}

log() {
    level=$1
    shift
    message=$*
    level_num=$(get_log_level_num "$level")
    min_level_num=$(get_log_level_num "$LOG_LEVEL")

    if [ -n "$level_num" ] && [ -n "$min_level_num" ]; then
        if [ "$level_num" -ge "$min_level_num" ]; then
            check_log_size
            datetime=$(date "+%Y-%m-%d %H:%M:%S")
            printf "[%s] [%s] %s\n" "$datetime" "${level}" "$message" >>"$LOG_FILE"
        fi
    fi
}

log_debug() {
    log "debug" "$@"
}

log_info() {
    log "info" "$@"
}

log_warn() {
    log "warn" "$@"
}

log_error() {
    log "error" "$@"
}
