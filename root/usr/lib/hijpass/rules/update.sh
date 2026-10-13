#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
HIJPASS_LIB=$(CDPATH= cd -- "${0%/*}/.." && pwd) || exit 1
. "$HIJPASS_LIB/common.sh"

data="${0%/*}/rulescli.uc"
action=${1:-update}
[ "$#" -eq 0 ] || shift
if [ "$action" = query ]; then hijpass_data "$data" query "$@"; exit $?; fi
plan=$(hijpass_data "$data" plan "$action" "$@") || { hijpass_error 'invalid rules configuration'; exit 1; }
json_load "$plan" || exit 1
json_get_vars timeout retries enabled
json_select jobs
json_get_keys jobs
work=$(mktemp -d /tmp/hijpass-rules.XXXXXX) || exit 1
temp=
trap 'if [ -n "$temp" ]; then rm -f "$temp" "$temp.text"; fi; rm -rf "$work"' EXIT
set --
for job in $jobs; do
    json_select "$job"
    json_get_vars key kind path
    json_select urls
    json_get_keys urls
    valid=0
    : >"$work/merged"
    if [ -n "$path" ] && [ -n "$urls" ] && mkdir -p "$(dirname -- "$path")"; then
        temp=$(mktemp "$path.new.XXXXXX") || temp=
        if [ -n "$temp" ]; then
            for entry in $urls; do
                json_get_var url "$entry"
                case "$url" in http://*|https://*) ;; *) continue ;; esac
                attempt=0
                downloaded=0
                # 所有资源共用下载重试；文本资源的合并由 ucode 完成。
                while [ "$attempt" -lt "$retries" ]; do
                    if curl -f -sS -L --connect-timeout "$timeout" --max-time "$((timeout * 2))" -o "$temp" -- "$url" && [ "$(wc -c <"$temp")" -gt 100 ]; then
                        downloaded=1
                        break
                    fi
                    attempt=$((attempt + 1))
                    [ "$attempt" -ge "$retries" ] || sleep 2
                done
                [ "$downloaded" -eq 1 ] || continue
                if [ "$kind" = geo ]; then
                    probe=example.org
                    [ "$key" != geoip ] || probe=1.1.1.1
                    if geoview -type "$key" -action lookup -input "$temp" -value "$probe" >/dev/null 2>&1; then valid=1; break; fi
                elif hijpass_data "$data" normalize "$kind" "$temp" >"$work/normalized" && grep -q '[^[:space:]]' "$work/normalized"; then
                    cat "$work/normalized" >>"$work/merged"
                    valid=1
                fi
            done
            if [ "$valid" -eq 1 ]; then
                if [ "$kind" = geo ]; then
                    chmod 644 "$temp" && mv -f "$temp" "$path" || valid=0
                else
                    hijpass_data "$data" merge "$work/merged" >"$temp.text" && chmod 644 "$temp.text" && mv -f "$temp.text" "$path" || valid=0
                fi
            fi
            rm -f "$temp" "$temp.text"
            temp=
        fi
    fi
    if [ "$valid" -ne 1 ]; then echo "$key: no valid download" >&2; set -- "$@" "$key"; fi
    json_select ..
    json_select ..
done
if [ "$action" = update ] && [ "$enabled" = 1 ]; then
    /etc/init.d/hijpass restart || set -- "$@" restart
fi
hijpass_data "$data" result "$@"
