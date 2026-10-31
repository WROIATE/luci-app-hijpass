#!/bin/sh
. /usr/lib/hijpass/common.sh
settings=$(hijpass_run_ucode "$HIJPASS_LIB/service/preparecli.uc" settings "$@") || exit 1
json_load "$settings" || exit 1
json_get_var update_interval update_interval
last=/tmp/hijpass_last_update
[ "$update_interval" -gt 0 ] || exit 0
now=$(date +%s)
previous=$(cat "$last" 2>/dev/null) || previous=0
case "$previous" in ''|*[!0-9]*) previous=0 ;; esac
[ "$((now - previous))" -ge "$((update_interval * 86400))" ] || exit 0
hijpass_log INFO rules "${LINENO:-}" 'Scheduled update is due'
HIJPASS_UPDATE_SOURCE=scheduled
export HIJPASS_UPDATE_SOURCE
# 下载和应用都由更新执行器完成，锁覆盖完整过程，外层不再重复重启。
"$HIJPASS_LIB/rules/update.sh" update "$@" >/dev/null
code=$?
[ "$code" -ne 75 ] || exit 0
[ "$code" -eq 0 ] || exit "$code"
printf '%s\n' "$now" >"$last" || exit 1
