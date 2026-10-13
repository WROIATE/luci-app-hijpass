#!/bin/sh

# worker 脱离 RPC 后保留输出，最后原子发布退出状态。
directory=$1
shift
trap '' HUP
"${0%/*}/capture.sh" "$@" >"$directory/stdout" 2>"$directory/stderr"
code=$?
printf '%s\n' "$code" >"$directory/exit.tmp"
mv "$directory/exit.tmp" "$directory/exit"
