#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

root=/tmp/hijpass-trace-tasks
action=${1:-}
[ "$#" -eq 0 ] || shift
task_path() {
    id=$1
    case "$id" in *[!A-Za-z0-9]*|'') echo 'Invalid trace task ID' >&2; return 1 ;; esac
    [ "${#id}" -eq 8 ] || { echo 'Invalid trace task ID' >&2; return 1; }
    directory="$root/$id"
    [ -d "$directory" ] && [ ! -L "$directory" ] || { echo 'Trace task not found' >&2; return 1; }
}
running() {
    [ ! -f "$directory/exit" ] || return 1
    pid=$(cat "$directory/pid" 2>/dev/null)
    [ -n "$pid" ] || return 0
    case "$pid" in *[!0-9]*) return 1 ;; esac
    [ -d "/proc/$pid" ]
}
case "$action" in
    start)
        mkdir -p "$root" && chmod 700 "$root" || exit 1
        # 清理已结束的过期任务；仍运行的 worker 不受目录年龄影响。
        for expired in $(find "$root" -mindepth 1 -maxdepth 1 -type d -mmin +10); do
            task_path "${expired##*/}" || continue
            running || rm -rf -- "$directory"
        done
        directory=$(mktemp -d "$root/XXXXXXXX") || exit 1
        : >"$directory/stdout"
        : >"$directory/stderr"
        # BusyBox 的后台启动只重定向标准流，RPC 还可能留下额外的 pipe。
        # 子进程先关闭这些描述符，父进程仍保留 stdout 来返回任务 ID。
        if ! (
            for descriptor in /proc/self/fd/*; do
                descriptor=${descriptor##*/}
                case "$descriptor" in 0|1|2|*[!0-9]*) continue ;; esac
                # eval 仅用于 Shell 的数字描述符语法，不解释配置或请求内容。
                eval "exec $descriptor>&-"
            done
            exec start-stop-daemon -S -b -m -p "$directory/pid" -x "$HIJPASS_LIB/diagnostics/worker.sh" -- "$directory" "$@"
        ); then
            rm -rf -- "$directory"
            echo 'Cannot start trace worker' >&2
            exit 1
        fi
        printf '%s\n' "${directory##*/}" ;;
    status)
        task_path "${1:-}" || exit 1
        active=0
        if running; then active=1
        elif [ ! -f "$directory/exit" ]; then
            hijpass_log ERROR trace "${LINENO:-}" "${directory##*/}: worker exited without a result"
            printf 'Trace worker exited without a result\n' >>"$directory/stderr"
            printf '1\n' >"$directory/exit"
        fi
        hijpass_data "$HIJPASS_LIB/diagnostics/capturecli.uc" task-status "$directory" "$active" ;;
    release)
        task_path "${1:-}" || exit 1
        [ -f "$directory/exit" ] || { echo 'Trace task has not finished' >&2; exit 1; }
        rm -rf -- "$directory" ;;
    *) echo 'Unknown trace task action' >&2; exit 1 ;;
esac
