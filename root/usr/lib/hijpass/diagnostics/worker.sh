#!/bin/sh

# worker 脱离 RPC 后保留输出，最后原子发布退出状态。
. /usr/lib/hijpass/common.sh
directory=$1
shift
trap '' HUP
HIJPASS_TASK_ID=${directory##*/}
export HIJPASS_TASK_ID
started=$(date +%s)
hijpass_log INFO trace "${LINENO:-}" 'Capture started'
"/usr/lib/hijpass/diagnostics/capture.sh" "$@" >"$directory/stdout" 2>"$directory/stderr"
code=$?
level=INFO
[ "$code" -eq 0 ] || level=ERROR
if [ -s "$directory/stderr" ]; then
    hijpass_run_ucode "$HIJPASS_LIB/maintenance/logscli.uc" command trace "$0:${LINENO:-}" "$code" 'Capture' "$directory/stderr" >/dev/null 2>&1 || :
fi
hijpass_log "$level" trace "${LINENO:-}" "Capture finished: exit=$code, elapsed=$(($(date +%s) - started))s"
printf '%s\n' "$code" >"$directory/exit.tmp"
mv "$directory/exit.tmp" "$directory/exit"
