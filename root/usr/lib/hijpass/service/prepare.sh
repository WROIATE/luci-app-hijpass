#!/bin/sh
# 生成配置、执行外部转换和配置检查；stdout 仅输出 procd 所需数据。
. /usr/lib/hijpass/common.sh
server=
[ "${1:-}" != server ] || { server=server; shift; }
data="$HIJPASS_LIB/service/preparecli.uc"
run_data() {
    if [ -n "$server" ]; then
        hijpass_run_ucode "$data" server "$@"
    else
        hijpass_run_ucode "$data" "$@"
    fi
}
settings=$(run_data settings "$@") || exit 1
json_load "$settings" || exit 1
json_get_vars enabled geo_convert
if [ "$enabled" = 1 ]; then
    if [ -z "$server" ]; then
        run_data configs "$@" || exit 1
        [ "$geo_convert" != 1 ] || "$HIJPASS_LIB/rules/geoview.sh" --convert "$@" || exit 1
        "$HIJPASS_LIB/rules/geoview.sh" dns "$@" || exit 1
    fi
    json_select log_paths
    json_get_keys entries
    for entry in $entries; do
        json_get_var path "$entry"
        mkdir -p "$(dirname -- "$path")" || exit 1
    done
fi
plan=$(run_data prepare "$@") || exit 1
json_load "$plan" && json_select instances || exit 1
json_get_keys entries
keys='' value=''
for entry in $entries; do
    json_select "$entry"
    json_get_values check check
    if [ -n "$check" ]; then
        set --
        for field in env check; do
            json_select "$field"
            json_get_keys keys
            for key in $keys; do
                json_get_var value "$key"
                set -- "$@" "$value"
            done
            json_select ..
        done
        env "$@" >&2 || exit 1
    fi
    json_select ..
done
printf '%s\n' "$plan"
