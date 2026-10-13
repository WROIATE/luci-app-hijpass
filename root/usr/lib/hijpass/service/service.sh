#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

data="$HIJPASS_LIB/service/preparecli.uc"
server=0
if [ "${1:-}" = server ]; then server=1; shift; fi
action=${1:-}
[ "$#" -eq 0 ] || shift
config_directory=
if [ "${1:-}" = --configdir ]; then
    config_directory=${2:-}
    [ -n "$config_directory" ] || { echo 'missing --configdir' >&2; exit 1; }
    shift 2
fi
with_config() {
    local executable="$1"
    shift
    if [ -n "$config_directory" ]; then "$executable" "$@" --configdir "$config_directory"; else "$executable" "$@"; fi
}
data_call() {
    if [ "$server" = 1 ]; then with_config hijpass_data "$data" server "$@"; else with_config hijpass_data "$data" "$@"; fi
}
case "$action" in plan|delay) data_call "$action" "$@"; exit $? ;; esac
settings=$(data_call settings "$@") || exit 1
json_load "$settings" || exit 1
json_get_vars enabled geo_convert dns_hook update_interval

cron_update() {
    data_call cron "$1" || return 1
    /etc/init.d/cron restart
}
hook() { [ -z "$dns_hook" ] || "$dns_hook" "$1"; }
stop_client() {
    # 即使一个步骤失败，其余资源仍继续清理；最后统一返回失败。
    failed=0
    hook stop || failed=1
    "$HIJPASS_LIB/firewall/route.sh" remove || failed=1
    "$HIJPASS_LIB/firewall/firewall.sh" remove || failed=1
    cron_update disable || failed=1
    rm -f /etc/hijpass/chinadns-ng.conf /tmp/hijpass/domain-proxy-geo.txt /tmp/hijpass/domain-direct-geo.txt || failed=1
    [ "$failed" -eq 0 ] || return 1
    "$HIJPASS_LIB/maintenance/logs.sh" append INFO 'Service stopped'
}
case "$action" in
    prepare)
        if [ "$enabled" = 1 ]; then
            # 数据准备全部完成才交给 procd；外部转换工具由本层调用。
            if [ "$server" = 0 ]; then
                data_call configs "$@" || exit 1
                [ "$geo_convert" != 1 ] || with_config "$HIJPASS_LIB/rules/geoview.sh" --convert "$@" || exit 1
                with_config "$HIJPASS_LIB/rules/geoview.sh" dns "$@" || exit 1
            fi
            json_select log_paths
            json_get_keys entries
            for entry in $entries; do json_get_var path "$entry"; mkdir -p "$(dirname -- "$path")" || exit 1; done
            json_select ..
        fi
        data_call prepare "$@" ;;
    activate)
        [ "$enabled" = 1 ] || exit 0
        if [ "$server" = 1 ]; then
            data_call server-files "$@" && fw4 reload && cron_update enable
        else
            # 启动错误回滚与命令执行集中在 Shell，ucode 不再驱动服务启停。
            if with_config "$HIJPASS_LIB/firewall/firewall.sh" reset "$@" && "$HIJPASS_LIB/firewall/route.sh" reset && hook start && cron_update enable; then
                "$HIJPASS_LIB/maintenance/logs.sh" append INFO 'Service started'
            else
                stop_client
                exit 1
            fi
        fi ;;
    deactivate)
        if [ "$server" = 1 ]; then
            rm -f /usr/share/nftables.d/table-post/hijserver.nft /usr/share/nftables.d/chain-pre/input_wan/hijserver.nft
            failed=0
            fw4 reload || failed=1
            cron_update disable || failed=1
            exit "$failed"
        else stop_client; fi ;;
    auto-update)
        last=/tmp/hijpass_last_update
        [ "$update_interval" -gt 0 ] || exit 0
        now=$(date +%s)
        previous=$(cat "$last" 2>/dev/null) || previous=0
        case "$previous" in ''|*[!0-9]*) previous=0 ;; esac
        [ "$((now - previous))" -ge "$((update_interval * 86400))" ] || exit 0
        with_config "$HIJPASS_LIB/rules/update.sh" all "$@" >/dev/null || exit 1
        printf '%s\n' "$now" >"$last" || exit 1
        [ "$enabled" != 1 ] || /etc/init.d/hijpass restart ;;
    *) echo 'unknown service action' >&2; exit 1 ;;
esac
