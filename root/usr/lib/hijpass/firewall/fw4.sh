#!/bin/sh
# fw4 的 script include：只加载已生成的规则，不生成配置或再次 reload。
. /usr/lib/hijpass/common.sh
HIJPASS_LOG_SOURCE=/usr/lib/hijpass/firewall/fw4.sh
rules=/etc/hijpass/fw4-rules.nft
hook=/etc/hijpass/hook/nft-hook.sh

if nft list table inet hijpass >/dev/null 2>&1; then
    hijpass_run_logged 'Remove hijpass nft table' nft delete table inet hijpass || exit 1
fi
[ -f "$rules" ] || exit 0
hijpass_run_logged 'Apply hijpass nft rules' nft -f "$rules" || exit 1
[ ! -x "$hook" ] || hijpass_run_logged 'Run hijpass NFT Hook' "$hook" || exit 1
hijpass_log INFO 'Applied hijpass client nft rules'
