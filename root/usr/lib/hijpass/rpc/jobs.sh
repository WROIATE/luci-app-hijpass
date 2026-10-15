#!/bin/sh

# 下载、服务重启可能超过 RPC 超时。只接收固定任务名，后台执行并保留结果供轮询。
. /usr/lib/hijpass/common.sh
root=/tmp/hijpass-jobs
action=$1
id=${2:-}
case "$action" in
    start)
        case "$id" in rules|restart|xray|sing-box) ;; *) hijpass_error 'unknown job'; exit 1 ;; esac
        mkdir -p "$root" && chmod 700 "$root" || exit 1
        # 仅回收已完成且超过一小时的任务，运行中任务不按目录时间删除。
        for expired in "$root"/*; do
            [ -f "$expired/exit" ] || continue
            find "$expired" -maxdepth 0 -mmin +60 -exec rm -rf -- '{}' ';'
        done
        directory=$(mktemp -d "$root/XXXXXXXX") || exit 1
        if ! (
            for descriptor in /proc/self/fd/*; do
                descriptor=${descriptor##*/}
                case "$descriptor" in 0|1|2|*[!0-9]*) continue ;; esac
                eval "exec $descriptor>&-"
            done
            exec start-stop-daemon -S -b -m -p "$directory/pid" -x "$HIJPASS_LIB/rpc/jobs.sh" -- worker "$id" "$directory"
        ); then rm -rf -- "$directory"; hijpass_error 'cannot start job'; exit 1; fi
        json_init; json_add_string id "${directory##*/}"; json_dump ;;
    worker)
        directory=$3
        trap '' HUP
        case "$id" in
            rules) "$HIJPASS_LIB/rules/update.sh" update ;;
            restart) /etc/init.d/hijpass restart ;;
            xray|sing-box) "$HIJPASS_LIB/core/update.sh" update "$id" ;;
            *) exit 1 ;;
        esac >"$directory/stdout" 2>"$directory/stderr"
        printf '%s\n' "$?" >"$directory/exit.tmp"
        mv "$directory/exit.tmp" "$directory/exit" ;;
    status|release)
        case "$id" in ''|*[!A-Za-z0-9]*) hijpass_error 'invalid job ID'; exit 1 ;; esac
        [ "${#id}" -eq 8 ] || { hijpass_error 'invalid job ID'; exit 1; }
        directory="$root/$id"
        [ -d "$directory" ] && [ ! -L "$directory" ] || { hijpass_error 'job not found'; exit 1; }
        if [ "$action" = release ]; then
            [ -f "$directory/exit" ] || { hijpass_error 'job still running'; exit 1; }
            rm -rf -- "$directory"
            printf '{"ok":true}\n'
            exit 0
        fi
        # worker 已消失却没有发布状态，也要结束轮询并报告真实失败。
        if [ ! -f "$directory/exit" ] && [ -f "$directory/pid" ]; then
            pid=$(cat "$directory/pid")
            if ! kill -0 "$pid" 2>/dev/null; then
                printf 'job exited without a result\n' >>"$directory/stderr"
                printf '1\n' >"$directory/exit"
            fi
        fi
        json_init
        if [ -f "$directory/exit" ]; then
            json_add_boolean running 0
            json_add_int code "$(cat "$directory/exit")"
            json_add_string stdout "$(cat "$directory/stdout")"
            json_add_string stderr "$(cat "$directory/stderr")"
        else json_add_boolean running 1; fi
        json_dump ;;
    *) hijpass_error 'unknown job action'; exit 1 ;;
esac
