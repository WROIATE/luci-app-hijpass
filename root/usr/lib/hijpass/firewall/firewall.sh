#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

data="$HIJPASS_LIB/firewall/generatecli.uc"
rules=/etc/hijpass/fw4-rules.nft
action=${1:-}
[ "$#" -eq 0 ] || shift
# show/generate 是只读入口；不为轮询和预览生成 INFO 日志。
stage=$action
trap 'code=$?; if [ "$code" -ne 0 ]; then hijpass_log ERROR firewall "$stage failed: exit=$code"; fi' EXIT
case "$action" in
    show) exec nft list table inet hijpass ;;
    remove)
        rm -f "$rules" && hijpass_step firewall 'Reload after removal' fw4 reload || exit 1
        hijpass_log INFO firewall 'Application rules removed'
        exit 0 ;;
    apply)
        # fw4 include 在重载后调用；这里只应用本应用表及用户 Hook。
        if nft list table inet hijpass >/dev/null 2>&1; then nft delete table inet hijpass || exit 1; fi
        [ -f "$rules" ] || exit 0
        hijpass_step firewall 'Apply nft rules' nft -f "$rules" || exit 1
        hook=$(hijpass_data "$data" hook) || exit 1
        [ -z "$hook" ] || [ ! -x "$hook" ] || hijpass_step firewall 'NFT Hook' "$hook" || exit 1
        hijpass_log INFO firewall 'nft rules applied'
        exit 0 ;;
    reset|generate) ;;
    *) echo 'unknown firewall action' >&2; exit 1 ;;
esac
work=$(mktemp -d /tmp/hijpass-firewall.XXXXXX) || exit 1
temp="$rules.new.$$"
trap 'code=$?; rm -f "$temp"; rm -rf "$work"; if [ "$code" -ne 0 ]; then hijpass_log ERROR firewall "$stage failed: exit=$code"; fi' EXIT
# 命令失败与输出分别记录；ucode 只解析成功返回的网络快照。
fw4 zone wan >"$work/wan" 2>/dev/null || :
ip -j address show >"$work/addresses" 2>/dev/null
printf '%s\n' "$?" >"$work/addresses.code"
ubus call network.interface dump >"$work/interfaces" 2>/dev/null
printf '%s\n' "$?" >"$work/interfaces.code"
if [ "$action" = generate ]; then hijpass_data "$data" "$work" "$@"; exit $?; fi
umask 077
stage=generation
hijpass_log INFO firewall 'Generating rules from current network snapshot'
hijpass_data "$data" "$work" "$@" >"$temp" || exit 1
if [ ! -s "$temp" ]; then
    rm -f "$rules" && hijpass_step firewall 'Reload empty rules' fw4 reload || exit 1
    hijpass_log INFO firewall 'No active rules; application rules removed'
    exit 0
fi
# 规则必须完整校验后才替换旧文件，目标旁边的临时文件保证 rename 原子性。
stage=validation
hijpass_step firewall 'Validate nft rules' nft -c -f "$temp" || exit 1
stage=installation
mv -f "$temp" "$rules" || exit 1
stage=reload
hijpass_step firewall 'Reload rules' fw4 reload || exit 1
hijpass_log INFO firewall "Rules validated and reloaded: bytes=$(wc -c <"$rules")"
