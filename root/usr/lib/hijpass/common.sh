#!/bin/sh

# LuCI 包的安装路径固定，各功能入口共用这个只读目录常量。
readonly HIJPASS_LIB=/usr/lib/hijpass
readonly HIJPASS_JOB_ROOT=/tmp/hijpass-jobs

# Shell 只用 jshn 消费业务对象，不把 JSON 当成命令执行，也不使用 eval。
. /usr/share/libubox/jshn.sh
hijpass_run_ucode() {
    # -- 分隔解释器选项和业务参数，兼容旧版本以及 glibc 宿主机的 getopt。
    ucode -S -- "$@"
}
hijpass_print_error_json() { hijpass_run_ucode "$HIJPASS_LIB/result.uc" error "$1"; }

# 调用点显式传入 $LINENO；子进程中的日志 CLI 无法恢复 Shell 调用位置。
hijpass_log() (
    level=$1 module=$2 source="$0${3:+:$3}"
    shift 3
    if [ -n "${config_directory:-}" ]; then
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" source "$level" "$source" "[$module] $*" --configdir "$config_directory"
    else
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" source "$level" "$source" "[$module] $*"
    fi >/dev/null 2>&1 || logger -t hijpass -p daemon.err 'Application logging failed' >/dev/null 2>&1
    exit 0
)

# 只在实际命令边界处理 stderr，保持业务 stdout 和原始退出状态。
hijpass_run_logged() {
    local module="$1" phase="$2" source="$0${3:+:$3}" output code
    shift 3
    output=$(mktemp /tmp/hijpass-step.XXXXXX) || {
        hijpass_log WARN "$module" "${LINENO:-}" "$phase: cannot capture diagnostic output"
        "$@" 9>&-
        return $?
    }
    # 更新锁不能传给 procd 启动的长期进程；更新控制进程仍持有锁。
    "$@" 9>&- 2>"$output"
    code=$?
    if [ -n "${config_directory:-}" ]; then
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" command "$module" "$source" "$code" "$phase" "$output" --configdir "$config_directory"
    else
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" command "$module" "$source" "$code" "$phase" "$output"
    fi >/dev/null 2>&1 || logger -t hijpass -p daemon.err 'Command logging failed' >/dev/null 2>&1
    [ "$code" -eq 0 ] || printf '%s failed; see main log\n' "$phase" >&2
    rm -f "$output"
    return "$code"
}
