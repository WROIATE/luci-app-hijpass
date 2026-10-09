#!/bin/sh
# 仅桥接脱离 RPC 的进程与文件描述符；参数解析、捕获、报告和任务查询均在 ucode。
directory=$1
shift
trap '' HUP
"${0%/*}/trace-url.sh" "$@" >"$directory/stdout" 2>"$directory/stderr"
code=$?
printf '%s\n' "$code" >"$directory/exit.tmp"
mv "$directory/exit.tmp" "$directory/exit"
