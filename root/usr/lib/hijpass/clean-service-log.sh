#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

. /lib/functions.sh

log_debug "$0"

clean_log() {
    local log_file
    config_get log_file "$1" log_path
    echo $log_file
    [ -z "$log_file" ] && return
    if [ -f "$log_file" ]; then
        tail -n 30000 "$log_file" >"$log_file.tmp" && cat "$log_file.tmp" >"$log_file"
        log_debug "Successfully cleaned log file: $log_file"
        rm "$log_file.tmp"
    fi
}

case "$1" in
clean)
    echo "" >"$2"
    log_info "Manually trigger log cleanup, log file: $2"
    ;;
hijpass)
    config_load hijpass
    config_foreach clean_log hijpass
    config_foreach clean_log proxy_node
    config_foreach clean_log shunt
    ;;
hijserver)
    config_load hijserver
    config_foreach clean_log server_node
    ;;
  *)
    config_load hijpass
    config_foreach clean_log hijpass
    config_foreach clean_log proxy_node
    config_foreach clean_log shunt

    config_load hijserver
    config_foreach clean_log server_node
esac
