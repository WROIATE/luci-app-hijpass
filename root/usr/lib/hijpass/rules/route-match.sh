#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
HIJPASS_LIB=$(CDPATH= cd -- "${0%/*}/.." && pwd) || exit 1
. "$HIJPASS_LIB/common.sh"

target=${1:-}
[ "$#" -eq 0 ] || shift
plan=$(hijpass_data "${0%/*}/rulescli.uc" match-plan "$target" "$@") || exit 1
json_load "$plan" || exit 1
json_get_vars kind lookup
output=$(mktemp /tmp/hijpass-match.XXXXXX) || exit 1
trap 'rm -f "$output"' EXIT
if [ "$lookup" = 1 ]; then "${0%/*}/geoview.sh" -l "$kind" "$target" >"$output" || exit 1; fi
hijpass_data "${0%/*}/rulescli.uc" match "$target" "$output" "$@"
