#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

# 安装时准备系统账户、目录与防火墙入口；旧配置转换独立执行。
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
hijpass_data "$HIJPASS_LIB/install/migrate.uc" || exit 1
# 防火墙 include 是安装配置，不属于旧字段迁移。
uci -q set firewall.hijpass=include &&
    uci -q set firewall.hijpass.type=script &&
    uci -q set firewall.hijpass.path=/usr/lib/hijpass/firewall/fw4.sh &&
    uci -q commit firewall || exit 1
mkdir -p /etc/hijpass/client /etc/hijpass/server /tmp/hijpass/log /tmp/hijserver/log || exit 1
rm -rf /tmp/luci-*cache
