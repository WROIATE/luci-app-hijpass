#!/bin/sh
# 两个 init 共用的文件写入：保留其他任务，写完后替换；重载由 init 负责。
service=$1 schedule=$2 logs=$3
cron=/etc/crontabs/root
[ ! -d "$cron" ] || { echo "$cron is a directory" >&2; exit 1; }
mkdir -p "$(dirname "$cron")" || exit 1
temp=$(mktemp "$cron.XXXXXX") || exit 1
trap 'rm -f "$temp"' EXIT
input=$cron
[ -e "$input" ] || input=/dev/null
sed "\| /usr/lib/hijpass/maintenance/logs\.sh $service\$|d" "$input" >"$temp" || exit 1
if [ "$service" = hijpass ]; then
    sed -i '\| /usr/lib/hijpass/rules/update\.sh update|d' "$temp" || exit 1
fi
if [ -n "$schedule" ]; then
    printf '%s /usr/lib/hijpass/rules/update.sh update --scheduled\n' "$schedule" >>"$temp" || exit 1
fi
if [ "$logs" = 1 ]; then
    printf '*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh %s\n' "$service" >>"$temp" || exit 1
fi
mv -f "$temp" "$cron"
