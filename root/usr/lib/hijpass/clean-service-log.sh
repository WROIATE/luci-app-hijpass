#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

log_debug "$0"

REDIRECT_PROXY_LOG=$(uci -q get hijpass.@proxy[0].log_redirect || :)
PROXY_LOG_PATH=$(uci -q get hijpass.@proxy[0].log_path || :)
REDIRECT_SHUNT_LOG=$(uci -q get hijpass.@shunt[0].log_redirect || :)
SHUNT_LOG_PATH=$(uci get -q hijpass.@shunt[0].log_path || :)

clean_log() {
    log_file="$1"
    if [ -f "$log_file" ]; then
        tail -n 1000 "$log_file" >"$log_file.tmp" && mv "$log_file.tmp" "$log_file"
        log_info "Successfully cleaned log file: $log_file"
    fi
}

[ "$REDIRECT_PROXY_LOG" = "1" ] && clean_log "$PROXY_LOG_PATH"

[ "$REDIRECT_SHUNT_LOG" = "1" ] && clean_log "$SHUNT_LOG_PATH"
