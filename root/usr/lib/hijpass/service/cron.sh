#!/bin/sh
# 两个 init 共用的文件写入：保留其他任务，写完后替换；重载由 init 负责。
service=$1 schedule=$2 logs=$3
cron=/etc/crontabs/root
mkdir -p "$(dirname "$cron")" || exit 1
temp=$(mktemp "$cron.XXXXXX") || exit 1
trap 'rm -f "$temp"' EXIT
input=$cron
[ -e "$input" ] || input=/dev/null
awk -v service="$service" -v schedule="$schedule" -v logs="$logs" '
    BEGIN {
        if (schedule != "" && (schedule ~ /[^A-Za-z0-9*\/,? -]/ || split(schedule, fields) != 5))
            exit 1
    }
    {
        command = ($1 ~ /^@/) ? 2 : 6
        if ($command == "/usr/lib/hijpass/maintenance/logs.sh" && $(command + 1) == service) next
        if (service == "hijpass" && $command == "/usr/lib/hijpass/rules/update.sh") next
        print
    }
    END {
        if (schedule != "") print schedule " /usr/lib/hijpass/rules/update.sh update --scheduled"
        if (logs == "1") print "*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh " service
    }
' "$input" >"$temp" || { echo "Cannot write $cron: invalid schedule or file error" >&2; exit 1; }
mv -f "$temp" "$cron"
