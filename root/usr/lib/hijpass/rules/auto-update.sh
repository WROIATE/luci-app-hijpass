#!/bin/sh
. /usr/lib/hijpass/common.sh
config_directory=/etc/config
if [ "$#" -ne 0 ]; then
    [ "$#" -eq 2 ] && [ "$1" = --configdir ] && [ -n "$2" ] || { echo "usage: $0 [--configdir directory]" >&2; exit 1; }
    config_directory=$2
fi
update_interval=$(uci -q -c "$config_directory" get 'hijpass.@rule[0].update_interval') || {
    hijpass_run_logged 'Read rule update configuration' uci -c "$config_directory" export hijpass >/dev/null || exit $?
    update_interval=0
}
update_interval=${update_interval:-0}
[ "$update_interval" -ge 0 ] 2>/dev/null || { hijpass_log ERROR 'Invalid rule update interval'; exit 1; }
last=/tmp/hijpass_last_update
[ "$update_interval" -gt 0 ] || exit 0
# 去掉正号和前导零，避免 Shell 算术将配置值视为八进制。
update_interval=${update_interval#+}
while [ "${update_interval#0}" != "$update_interval" ]; do
    update_interval=${update_interval#0}
done
now=$(date +%s)
previous=$(cat "$last" 2>/dev/null) || previous=0
case "$previous" in ''|*[!0-9]*) previous=0 ;; esac
[ "$((now - previous))" -ge "$((update_interval * 86400))" ] || exit 0
hijpass_log INFO 'Scheduled rule update is due'
HIJPASS_UPDATE_SOURCE=scheduled
export HIJPASS_UPDATE_SOURCE
# 下载和应用都由更新执行器完成，锁覆盖完整过程，外层不再重复重启。
"$HIJPASS_LIB/rules/update.sh" update "$@" >/dev/null
code=$?
[ "$code" -ne 75 ] || exit 0
[ "$code" -eq 0 ] || exit "$code"
printf '%s\n' "$now" >"$last" || exit 1
