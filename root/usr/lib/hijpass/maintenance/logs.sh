#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
HIJPASS_LIB=$(CDPATH= cd -- "${0%/*}/.." && pwd) || exit 1
. "$HIJPASS_LIB/common.sh"
hijpass_data "${0%/*}/logscli.uc" "$@"
