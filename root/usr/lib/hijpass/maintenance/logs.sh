#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh
if [ "${1:-}" = append ] && [ "$#" -ge 2 ]; then
    shift
    level=$1
    shift
    hijpass_data "$HIJPASS_LIB/maintenance/logscli.uc" source "$level" "$0:${LINENO:-}" "$@"
    exit $?
fi
hijpass_data "$HIJPASS_LIB/maintenance/logscli.uc" "$@"
