#!/bin/sh

# LuCI 包的安装路径固定，各功能入口共用这个只读目录常量。
readonly HIJPASS_LIB=/usr/lib/hijpass
readonly HIJPASS_JOB_ROOT=/tmp/hijpass-jobs
# 普通入口使用 $0；被框架 source 的入口在加载本文件后指定实际脚本路径。
HIJPASS_LOG_SOURCE=$0

# Shell 只用 jshn 消费业务对象，不把 JSON 当成命令执行，也不使用 eval。
. /usr/share/libubox/jshn.sh
hijpass_run_ucode() {
    # -- 分隔解释器选项和业务参数，兼容旧版本以及 glibc 宿主机的 getopt。
    ucode -S -- "$@"
}
hijpass_json_error() { hijpass_run_ucode "$HIJPASS_LIB/result.uc" error "$1"; }

# 更新与服务起停共用同一把锁；进程退出自动释放，不删除锁文件。
# 默认立即返回忙；服务起停最多等待指定次数，每次 2 秒。
hijpass_lock_updates() {
    local attempts=${1:-0}
    mkdir -p "$HIJPASS_JOB_ROOT" && chmod 700 "$HIJPASS_JOB_ROOT" || return 1
    exec 9>"$HIJPASS_JOB_ROOT/updates.lock" || return 1
    while ! flock -n 9; do
        [ "$attempts" -gt 0 ] || { exec 9>&-; return 75; }
        attempts=$((attempts - 1))
        command sleep 2 || { exec 9>&-; return 1; }
    done
}

# 业务消息直接描述操作，DEBUG 模式附加当前脚本路径。
hijpass_log() (
    level=$1
    shift
    if [ -n "${config_directory:-}" ]; then
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" source "$level" "$HIJPASS_LOG_SOURCE" "$*" --configdir "$config_directory"
    else
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" source "$level" "$HIJPASS_LOG_SOURCE" "$*"
    fi >/dev/null 2>&1 || logger -t hijpass -p daemon.err 'Application logging failed' >/dev/null 2>&1
    exit 0
)

# 只在实际命令边界处理 stderr，保持业务 stdout 和原始退出状态。
hijpass_run_logged() {
    local phase="$1" output code
    shift
    output=$(mktemp /tmp/hijpass-step.XXXXXX) || {
        hijpass_log WARN "$phase: cannot capture diagnostic output"
        "$@" 9>&-
        return $?
    }
    # 控制进程持有更新锁；外部命令不能将它传给长期后台进程。
    "$@" 9>&- 2>"$output"
    code=$?
    if [ -n "${config_directory:-}" ]; then
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" command "$HIJPASS_LOG_SOURCE" "$code" "$phase" "$output" --configdir "$config_directory"
    else
        hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" command "$HIJPASS_LOG_SOURCE" "$code" "$phase" "$output"
    fi >/dev/null 2>&1 || logger -t hijpass -p daemon.err 'Command logging failed' >/dev/null 2>&1
    [ "$code" -eq 0 ] || printf '%s failed; see main log\n' "$phase" >&2
    rm -f "$output"
    return "$code"
}
