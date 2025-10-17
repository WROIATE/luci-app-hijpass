#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

log_debug "$0"

clean_log() {
    local log_file
    config_get log_file "$1" log_path
    [ -z "$log_file" ] && return
    if [ -f "$log_file" ]; then
        tail -n 1000 "$log_file" >"$log_file.tmp" && cat "$log_file.tmp" >"$log_file"
        log_info "Successfully cleaned log file: $log_file"
        rm "$log_file.tmp"
    fi
}

case "$1" in
clean)
    ehco "" >"$2"
    log_info "Manually trigger log cleanup, log file: $2"
    ;;
*)
    config_load hijpass
    config_foreach clean_log proxy_node
    config_foreach clean_log shunt
    ;;
esac
