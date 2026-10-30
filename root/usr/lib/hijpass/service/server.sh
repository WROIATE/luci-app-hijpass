#!/bin/sh

# 服务端只管理自己的进程数据、端口放行和日志任务。
. /usr/lib/hijpass/common.sh
data="$HIJPASS_LIB/service/preparecli.uc"
action=${1:-}
data_call() { hijpass_data "$data" server "$@"; }
cron_update() {
    data_call cron "$1" || return 1
    hijpass_step server 'Cron reload' "${LINENO:-}" /etc/init.d/cron restart
}
trap 'code=$?; if [ "$code" -ne 0 ]; then hijpass_log ERROR server "${LINENO:-}" "$action failed: exit=$code"; fi' EXIT

case "$action" in
    prepare)
        settings=$(data_call settings) || exit 1
        json_load "$settings" || exit 1
        json_get_var enabled enabled
        if [ "$enabled" = 1 ]; then
            json_select log_paths
            json_get_keys entries
            for entry in $entries; do
                json_get_var path "$entry"
                mkdir -p "$(dirname -- "$path")" || exit 1
            done
        fi
        data_call prepare ;;
    activate)
        data_call server-files || exit 1
        hijpass_step server 'Firewall reload' "${LINENO:-}" fw4 reload || exit 1
        cron_update enable || exit 1
        hijpass_log INFO server "${LINENO:-}" 'Activation completed' ;;
    deactivate)
        rm -f /usr/share/nftables.d/table-post/hijserver.nft /usr/share/nftables.d/chain-pre/input_wan/hijserver.nft || exit 1
        hijpass_step server 'Firewall reload' "${LINENO:-}" fw4 reload || exit 1
        cron_update disable || exit 1
        hijpass_log INFO server "${LINENO:-}" 'Service resources removed' ;;
    *) echo 'unknown server action' >&2; exit 1 ;;
esac
