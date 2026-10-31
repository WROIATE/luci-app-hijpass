#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

data="$HIJPASS_LIB/service/preparecli.uc"
action=${1:-}
[ "$#" -eq 0 ] || shift
config_directory=
if [ "${1:-}" = --configdir ]; then
    config_directory=${2:-}
    [ -n "$config_directory" ] || { echo 'missing --configdir' >&2; exit 1; }
    shift 2
fi
run_with_config() {
    local executable="$1"
    shift
    if [ -n "$config_directory" ]; then "$executable" "$@" --configdir "$config_directory"; else "$executable" "$@"; fi
}
run_service_ucode() {
    run_with_config hijpass_run_ucode "$data" "$@"
}
case "$action" in plan|delay) run_service_ucode "$action" "$@"; exit $? ;; esac
settings=$(run_service_ucode settings "$@") || exit 1
json_load "$settings" || exit 1
json_get_vars enabled geo_convert dns_hook update_interval
module=service
started=$(date +%s)
trap 'code=$?; if [ "$code" -ne 0 ]; then hijpass_log ERROR "$module" "${LINENO:-}" "$action failed: exit=$code, elapsed=$(($(date +%s) - started))s"; fi' EXIT

update_cron() {
    run_service_ucode cron "$1" || return 1
    hijpass_run_logged "$module" 'Cron reload' "${LINENO:-}" /etc/init.d/cron restart
}
run_dns_hook() { [ -z "$dns_hook" ] || hijpass_run_logged "$module" "DNS Hook $1" "${LINENO:-}" "$dns_hook" "$1"; }
clear_aux() {
    # 关键撤流失败时阻止停核心；维护清理失败只记录告警。
    failed=0
    run_dns_hook stop || failed=1
    "$HIJPASS_LIB/firewall/firewall.sh" remove || return 1
    "$HIJPASS_LIB/firewall/route.sh" remove || failed=1
    update_cron disable || hijpass_log WARN "$module" "${LINENO:-}" 'Cron cleanup failed; continuing service stop'
    # 生成的 DNS 配置保留：start 在准备新配置后也会调用此清理入口。
    [ "$failed" -eq 0 ] || return 1
    hijpass_log INFO "$module" "${LINENO:-}" 'Service resources removed'
}
case "$action" in
    prepare)
        hijpass_log INFO "$module" "${LINENO:-}" "Preparing service: enabled=$enabled"
        if [ "$enabled" = 1 ]; then
            # 数据准备全部完成才交给 procd；外部转换工具由本层调用。
            run_service_ucode configs "$@" || exit 1
            [ "$geo_convert" != 1 ] || run_with_config "$HIJPASS_LIB/rules/geoview.sh" --convert "$@" || exit 1
            run_with_config "$HIJPASS_LIB/rules/geoview.sh" dns "$@" || exit 1
            json_select log_paths
            json_get_keys entries
            for entry in $entries; do json_get_var path "$entry"; mkdir -p "$(dirname -- "$path")" || exit 1; done
            json_select ..
        fi
        hijpass_run_logged "$module" 'Prepare process instances and DNS' "${LINENO:-}" run_service_ucode prepare "$@" ;;
    setup_aux)
        [ "$enabled" = 1 ] || exit 0
        # procd 提交实例后调用本入口；先准备策略路由，再启用流量接管。
        if "$HIJPASS_LIB/firewall/route.sh" reset && run_with_config "$HIJPASS_LIB/firewall/firewall.sh" reset "$@" && run_dns_hook start && update_cron enable; then
            hijpass_log INFO "$module" "${LINENO:-}" "Activation completed: elapsed=$(($(date +%s) - started))s"
        else
            hijpass_log ERROR "$module" "${LINENO:-}" 'Activation failed'
            exit 1
        fi ;;
    clear_aux)
        hijpass_log INFO "$module" "${LINENO:-}" 'Stopping service resources'
        clear_aux ;;
    auto-update)
        last=/tmp/hijpass_last_update
        [ "$update_interval" -gt 0 ] || exit 0
        now=$(date +%s)
        previous=$(cat "$last" 2>/dev/null) || previous=0
        case "$previous" in ''|*[!0-9]*) previous=0 ;; esac
        [ "$((now - previous))" -ge "$((update_interval * 86400))" ] || exit 0
        hijpass_log INFO rules "${LINENO:-}" 'Scheduled update is due'
        HIJPASS_UPDATE_SOURCE=scheduled
        export HIJPASS_UPDATE_SOURCE
        # 下载和应用都由更新执行器完成，锁覆盖完整过程，外层不再重复重启。
        run_with_config "$HIJPASS_LIB/rules/update.sh" update "$@" >/dev/null
        code=$?
        [ "$code" -ne 75 ] || exit 0
        [ "$code" -eq 0 ] || exit "$code"
        printf '%s\n' "$now" >"$last" || exit 1 ;;
    *) echo 'unknown service action' >&2; exit 1 ;;
esac
