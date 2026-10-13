#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
HIJPASS_LIB=$(CDPATH= cd -- "${0%/*}/.." && pwd) || exit 1
. "$HIJPASS_LIB/common.sh"

# 账户、目录及缓存是安装动作；UCI 的字段迁移仍由原生 ucode 数据模块完成。
for file in group passwd shadow; do
    case "$file" in
        group) entry='hijpass:x:4396:hijpass' ;;
        passwd) entry='hijpass:x:0:4396:hijpass:/var/run/hijpass:/bin/false' ;;
        shadow) entry='hijpass:x:0:0:99999:7:::' ;;
    esac
    if ! grep -q '^hijpass:' "/etc/$file"; then
        # 已有账户文件可能没有尾换行；先补分隔，避免与最后一个账户连在一起。
        [ ! -s "/etc/$file" ] || [ -z "$(tail -c 1 "/etc/$file")" ] || printf '\n' >>"/etc/$file" || exit 1
        printf '%s\n' "$entry" >>"/etc/$file" || exit 1
    fi
done
hijpass_data "${0%/*}/migratecli.uc" || exit 1
mkdir -p /etc/hijpass/client /etc/hijpass/server /tmp/hijpass/log /tmp/hijserver/log || exit 1
rm -rf /tmp/luci-*cache
