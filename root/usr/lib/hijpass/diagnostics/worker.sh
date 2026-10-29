#!/bin/sh

# worker 脱离 RPC 后保留输出，最后原子发布退出状态。
. /usr/lib/hijpass/common.sh
directory=$1
shift
trap '' HUP
HIJPASS_TASK_ID=${directory##*/}
export HIJPASS_TASK_ID
started=$(date +%s)
hijpass_log INFO trace 'Capture started'
"/usr/lib/hijpass/diagnostics/capture.sh" "$@" >"$directory/stdout" 2>"$directory/stderr"
code=$?
level=INFO
[ "$code" -eq 0 ] || level=ERROR
if [ -s "$directory/stderr" ]; then
    detail_level=$(hijpass_diagnostic_level "$directory/stderr" "$code")
    hijpass_log "$detail_level" trace "Capture diagnostic output:
$(head -c 8192 "$directory/stderr")"
fi
hijpass_log "$level" trace "Capture finished: exit=$code, elapsed=$(($(date +%s) - started))s"
printf '%s\n' "$code" >"$directory/exit.tmp"
mv "$directory/exit.tmp" "$directory/exit"
