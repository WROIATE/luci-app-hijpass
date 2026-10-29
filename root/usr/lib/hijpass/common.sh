#!/bin/sh

# LuCI 包的安装路径固定，各功能入口共用这个只读目录常量。
readonly HIJPASS_LIB=/usr/lib/hijpass

# Shell 只用 jshn 消费业务对象，不把 JSON 当成命令执行，也不使用 eval。
. /usr/share/libubox/jshn.sh
hijpass_data() {
    # -- 分隔解释器选项和业务参数，兼容旧版本以及 glibc 宿主机的 getopt。
    ucode -S -- "$@"
}
hijpass_error() { hijpass_data "$HIJPASS_LIB/result.uc" error "$1"; }

# 日志不占用业务 stdout，也不改变调用者的 jshn 命名空间或退出状态。
hijpass_log() (
    level=$1 module=$2
    shift 2
    if [ -n "${config_directory:-}" ]; then
        hijpass_data "$HIJPASS_LIB/maintenance/logscli.uc" append "$level" "[$module] $*" --configdir "$config_directory"
    else
        hijpass_data "$HIJPASS_LIB/maintenance/logscli.uc" append "$level" "[$module] $*"
    fi >/dev/null 2>&1 || logger -t hijpass -p daemon.err 'Application logging failed' >/dev/null 2>&1
    exit 0
)

# fw4 的 [I] 消息也写 stderr；显式信息保持 INFO，其余成功诊断默认 WARN。
hijpass_diagnostic_level() {
    if [ "$2" -ne 0 ] || grep -Eq '^[[:space:]]*(\[E\]|ERROR[:[:space:]])' "$1"; then
        printf 'ERROR\n'
    elif grep -q '[^[:space:]]' "$1" && ! grep -Eqv '^[[:space:]]*(\[I\][[:space:]]|$)' "$1"; then
        printf 'INFO\n'
    else
        printf 'WARN\n'
    fi
}

# 执行有副作用的阶段，保留原始 stderr/退出码；成功返回的告警同样记录。
hijpass_step() {
    local module="$1" phase="$2" output code level
    shift 2
    output=$(mktemp /tmp/hijpass-step.XXXXXX) || {
        hijpass_log WARN "$module" "$phase: cannot capture diagnostic output"
        "$@"
        return $?
    }
    "$@" 2>"$output"
    code=$?
    if [ "$code" -ne 0 ] || [ -s "$output" ]; then
        level=$(hijpass_diagnostic_level "$output" "$code")
        if [ -n "${HIJPASS_TASK_ID:-}" ]; then
            # 后台 worker 统一留存完整 stderr，阶段只记录上下文，避免重复详情。
            hijpass_log "$level" "$module" "$phase: exit=$code; diagnostic output retained by task"
        else
            hijpass_log "$level" "$module" "$phase: exit=$code
$(head -c 8192 "$output")"
        fi
        cat "$output" >&2
    fi
    rm -f "$output"
    return "$code"
}
