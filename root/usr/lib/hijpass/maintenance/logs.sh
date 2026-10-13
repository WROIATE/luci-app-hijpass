#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh
hijpass_data "$HIJPASS_LIB/maintenance/logscli.uc" "$@"
