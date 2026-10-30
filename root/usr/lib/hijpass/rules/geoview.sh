#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

data="$HIJPASS_LIB/rules/rulescli.uc"
action=${1:-}
[ "$#" -eq 0 ] || shift
case "$action" in
    -t|--convert) plan=$(hijpass_run_ucode "$data" geo-plan "$@") || exit 1; mode=convert ;;
    dns) plan=$(hijpass_run_ucode "$data" dns-plan "$@") || exit 1; mode=dns ;;
    -e|--extract|-l|--lookup) plan=$(hijpass_run_ucode "$data" geo-request "$action" "$@") || exit 1; mode=query ;;
    *) echo 'unknown Geo action' >&2; exit 1 ;;
esac
json_load "$plan" || exit 1
if [ "$mode" = query ]; then
    json_get_vars kind extract input
    json_select values
    json_get_keys entries
    set --
    for entry in $entries; do json_get_var value "$entry"; set -- "$@" "$value"; done
    output=$(mktemp /tmp/hijpass-geoview.XXXXXX) || exit 1
    trap 'rm -f "$output"' EXIT
    if [ "$extract" = 1 ]; then
        geoview -type "$kind" -action extract -input "$input" -list "$@" >"$output" || exit 1
    else
        geoview -type "$kind" -action lookup -input "$input" -value "$@" >"$output" || exit 1
    fi
    hijpass_run_ucode "$data" lower "$output"
    exit $?
fi
json_select jobs
json_get_keys jobs
completed=0
staged=
trap 'code=$?; if [ -n "$staged" ]; then rm -f "$staged"; fi; if [ "$code" -ne 0 ]; then hijpass_log ERROR geo "${LINENO:-}" "$mode failed: job=${job:-none}, exit=$code"; fi' EXIT
for job in $jobs; do
    json_select "$job"
    json_get_var output output
    mkdir -p "$(dirname -- "$output")" || exit 1
    staged=$(mktemp "$output.new.XXXXXX") || exit 1
    if [ "$mode" = convert ]; then
        json_get_vars database tag input
        hijpass_run_logged geo "Convert $database tag" "${LINENO:-}" geoview -type "$database" -action convert -format ruleset -input "$input" -regex -list "$tag" -output "$staged" || exit 1
    else
        json_get_var value value
        if [ -n "$value" ]; then
            hijpass_run_logged geo 'Extract DNS domains' "${LINENO:-}" geoview -type geosite -action extract -input /usr/share/v2ray/geosite.dat -list "$value" >"$staged" || exit 1
        else
            : >"$staged" || exit 1
        fi
    fi
    chmod 644 "$staged" || exit 1
    mv -f "$staged" "$output" || exit 1
    staged=
    completed=$((completed + 1))
    hijpass_log DEBUG geo "${LINENO:-}" "$mode: output=$output, bytes=$(wc -c <"$output")"
    json_select ..
done
hijpass_log INFO geo "${LINENO:-}" "$mode completed: outputs=$completed"
