#!/bin/sh

# 显式组织 procd 提交与检查：rc.common 的 USE_PROCD 包装会忽略部分失败返回值。
# 仍由 procd 管理进程、respawn 和配置触发器，不在本脚本中后台启动核心。
. /usr/lib/hijpass/common.sh
. /lib/functions/procd.sh
. /usr/lib/hijpass/service/procd.sh

# 原生帮助函数在清理 JSON/namespace 时丢失 ubus 的退出状态。
_procd_ubus_call() {
    local code
    ubus call service "$1" "$(json_dump)"
    code=$?
    json_cleanup
    return "$code"
}
_procd_call() {
    local old_cb code
    json_set_namespace procd old_cb
    "$@"
    code=$?
    json_set_namespace "$old_cb"
    return "$code"
}

service_name=$(basename "$initscript")
state_directory="/tmp/$service_name-service"
RUNTIME="$HIJPASS_LIB/service/service.sh"
transaction="$HIJPASS_LIB/service/transactioncli.uc"

runtime() {
    if [ "$service_name" = hijserver ]; then "$RUNTIME" server "$@"; else "$RUNTIME" "$@"; fi
}
phase() {
    apply_phase=$1
    hijpass_data "$transaction" status "$state_directory" applying "$apply_phase"
}
submit() {
    local plan
    plan=$(cat "$1/plan.json") || return 1
    procd_open_service "$service_name" "$initscript"
    hijpass_register_instances "$plan" || return 1
    procd_close_service
}
wait_ready() {
    local work="$1" attempt=0 stable=0
    while [ "$attempt" -lt 30 ]; do
        ubus call service list "{\"name\":\"$service_name\"}" >"$work/instances.json" || return 1
        if hijpass_data "$HIJPASS_LIB/service/readinesscli.uc" "$work/plan.json" "$work/instances.json" "$service_name" 2>"$work/readiness.error"; then
            stable=$((stable + 1))
            [ "$stable" -lt 2 ] || return 0
        else stable=0; fi
        attempt=$((attempt + 1))
        sleep 1
    done
    cat "$work/readiness.error" >&2
    echo 'Service readiness timed out' >&2
    return 1
}
check_cores() {
    local work="$1" entries entry engine path keys key value
    json_load "$(cat "$work/checks.json")" || return 1
    json_select checks || return 1
    json_get_keys entries
    for entry in $entries; do
        json_select "$entry"
        json_get_vars engine path
        json_select env
        json_get_keys keys
        set --
        for key in $keys; do json_get_var value "$key"; set -- "$@" "$value"; done
        json_select ..
        if [ "$engine" = xray ]; then
            hijpass_step service 'Check Xray configuration' "${LINENO:-}" env "$@" xray run -test -c "$path" || return 1
        else
            hijpass_step service 'Check sing-box configuration' "${LINENO:-}" env "$@" sing-box check -c "$path" || return 1
        fi
        json_select ..
    done
}
prepare_candidate() {
    local work="$1" rules
    hijpass_data "$transaction" snapshot "$work" "$service_name" || return 1
    runtime prepare --configdir "$work/config" --outputdir "$work/files" >"$work/plan.json" || return 1
    if [ "$service_name" = hijpass ]; then
        rules="$work/files/etc/hijpass/fw4-rules.nft"
        mkdir -p "$(dirname "$rules")" || return 1
        "$HIJPASS_LIB/firewall/firewall.sh" generate --configdir "$work/config" >"$rules" || return 1
        if [ -s "$rules" ]; then hijpass_step service 'Check firewall configuration' "${LINENO:-}" nft -c -f "$rules" || return 1; fi
    fi
    hijpass_data "$transaction" seal "$work" "$service_name" && check_cores "$work"
}
kill_instances() {
    local description kind entries entry pid pids= attempt=0 alive
    description=$(ubus call service list "{\"name\":\"$service_name\"}") || return 1
    json_load "$description" || return 1
    json_get_type kind "$service_name"
    [ "$kind" = object ] || return 0
    json_select "$service_name"
    json_get_type kind instances
    if [ "$kind" = object ]; then
        json_select instances
        json_get_keys entries
        for entry in $entries; do
            json_select "$entry"
            json_get_var pid pid
            case "$pid" in ''|*[!0-9]*) ;; *) pids="$pids $pid" ;; esac
            json_select ..
        done
    fi
    procd_kill "$service_name" || return 1
    while [ "$attempt" -lt 15 ]; do
        alive=0
        for pid in $pids; do kill -0 "$pid" 2>/dev/null && alive=1; done
        [ "$alive" = 1 ] || return 0
        attempt=$((attempt + 1))
        sleep 1
    done
    echo 'Service stop timed out' >&2
    return 1
}
ensure_triggers() {
    local description kind
    description=$(ubus call service list "{\"name\":\"$service_name\"}") || return 1
    json_load "$description" || return 1
    json_get_type kind "$service_name"
    [ "$kind" != object ] || return 0
    procd_open_service "$service_name" "$initscript"
    procd_close_service
}
stop_runtime() {
    # 先撤流，再停止核心。撤流失败时保留进程，避免残留规则指向空端口。
    runtime deactivate || return 1
    kill_instances
}
restore_runtime() {
    local work="$1" failed=0
    runtime deactivate || return 1
    kill_instances || return 1
    hijpass_data "$transaction" restore "$work" || failed=1
    if [ -f "$state_directory/active/plan.json" ]; then
        hijpass_data "$transaction" install "$state_directory/active" || return 1
        submit "$state_directory/active" && wait_ready "$state_directory/active" &&
            runtime activate --configdir "$state_directory/active/config" || return 1
    elif [ "$had_service" = 1 ]; then
        return 1
    fi
    return "$failed"
}
apply_service() (
    umask 077
    hijpass_data "$transaction" init "$state_directory" || exit 1
    work=
    switched=0 completed=0 rollback=none apply_phase=preparing had_service=0
    procd_running "$service_name" && had_service=1
    work=$(mktemp -d "$state_directory/candidate.XXXXXX") || exit 1
    # 包括信号退出；状态文件与日志不能把部分成功报告成整体成功。
    finish() {
        local code=$?
        trap - EXIT INT TERM
        if [ "$completed" = 1 ]; then return; fi
        [ "$code" -ne 0 ] || code=1
        if [ "$switched" = 1 ]; then
            if restore_runtime "$work"; then rollback=restored; else rollback=failed; fi
        fi
        hijpass_log ERROR service "${LINENO:-}" "Apply failed: phase=$apply_phase, rollback=$rollback"
        hijpass_data "$transaction" status "$state_directory" failed "$apply_phase" "$rollback"
        ensure_triggers || hijpass_log WARN service "${LINENO:-}" 'Cannot register configuration retry trigger'
        # 保留失败候选，包含用户自定义文件的新内容，供诊断/恢复；下次失败替换它。
        rm -rf "$state_directory/failed"
        mv "$work" "$state_directory/failed"
        exit "$code"
    }
    trap finish EXIT
    trap 'exit 1' INT TERM
    phase preparing || exit 1
    prepare_candidate "$work" || exit 1
    hijpass_data "$transaction" backup "$work" || exit 1
    phase stopping || exit 1
    switched=1
    stop_runtime || exit 1
    phase installing || exit 1
    hijpass_data "$transaction" install "$work" || exit 1
    phase starting || exit 1
    submit "$work" || exit 1
    phase waiting || exit 1
    wait_ready "$work" || exit 1
    phase activating || exit 1
    runtime activate --configdir "$work/config" || exit 1
    # 指针原子切换；失败前 active 始终指向上一份成功配置。
    hijpass_data "$transaction" status "$state_directory" applied complete || exit 1
    previous=
    previous=$(readlink "$state_directory/active")
    hijpass_data "$transaction" publish "$work" "$state_directory" || exit 1
    completed=1
    hijpass_log INFO service "${LINENO:-}" 'Service applied: instances ready, traffic activated'
    if [ -n "$previous" ]; then
        hijpass_data "$transaction" cleanup "$work" "$service_name" "$previous" ||
            hijpass_log WARN service "${LINENO:-}" 'Cannot remove obsolete node files'
        case "$previous" in "$state_directory"/candidate.*) rm -rf "$previous" ;; esac
    fi
    exit 0
)

start() { apply_service; }
restart() { apply_service; }
reload() { apply_service; }
stop() {
    hijpass_data "$transaction" init "$state_directory" || return 1
    stop_runtime || return 1
    ensure_triggers || return 1
    hijpass_data "$transaction" status "$state_directory" stopped complete
}
running() { procd_running "$service_name" "${1:-*}"; }
status() { _procd_status "$service_name" "$1"; }
info() { ubus call service list "{\"name\":\"$service_name\",\"verbose\":true}"; }
trace() { TRACE_SYSCALLS=1; start; }
extra_command running 'Check whether the service is running'
extra_command status 'Service status'
extra_command info 'Dump procd service info'
extra_command trace 'Start with syscall trace'
