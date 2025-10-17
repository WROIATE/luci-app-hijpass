#!/bin/sh

LOG_FILE="/tmp/log/hijpass.log"
MAX_SIZE=2000                                                        # Line
LOG_LEVEL=$(uci -q get hijpass.@hijpass[0].log_level || echo "INFO") # debug, info, warn, error

LOG_LEVELS="DEBUG:1 INFO:2 WARN:3 ERROR:4"

get_log_level_num() {
    local level="$1"
    echo "$LOG_LEVELS" | tr ' ' '\n' | grep "^$level:" | cut -d':' -f2
}

check_log_size() {
    if [ -f "$LOG_FILE" ]; then
        local size tmp_file
        size="$(wc -l "$LOG_FILE" | cut -d' ' -f1)"
        if [ "$size" -gt "$MAX_SIZE" ]; then
            tmp_file="${LOG_FILE}.tmp"
            tail -n 100 "$LOG_FILE" >"$tmp_file" 2>/dev/null
            cat "$tmp_file" >"$LOG_FILE"
            rm $tmp_file
            log_info "Log file rotated"
        fi
    fi
}

log() {
    local level level_num min_level_num message datetime
    level=$(echo "$1" | tr 'a-z' 'A-Z')
    shift
    message=$*
    level_num=$(get_log_level_num "$level")
    min_level_num=$(get_log_level_num "$LOG_LEVEL")

    if [ -n "$level_num" ] && [ -n "$min_level_num" ]; then
        if [ "$level_num" -ge "$min_level_num" ]; then
            check_log_size
            datetime=$(date "+%Y-%m-%d %H:%M:%S")
            if [ "$LOG_LEVEL" = "DEBUG" ]; then
                printf "%s   %-8s%-40s%s\n" "[$datetime]" "${level}" "$0" "$message" >>"$LOG_FILE"
            else
                printf "%s   %-8s%s\n" "[$datetime]" "${level}" "$message" >>"$LOG_FILE"
            fi
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
