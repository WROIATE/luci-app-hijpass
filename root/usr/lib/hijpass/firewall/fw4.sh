#!/bin/sh
# fw4 的 script include：只加载已生成的规则，不生成配置或再次 reload。
. /usr/lib/hijpass/common.sh
rules=/etc/hijpass/fw4-rules.nft
hook=/etc/hijpass/hook/nft-hook.sh

if nft list table inet hijpass >/dev/null 2>&1; then
    hijpass_run_logged firewall 'Remove nft table' "${LINENO:-}" nft delete table inet hijpass || exit 1
fi
[ -f "$rules" ] || exit 0
hijpass_run_logged firewall 'Apply nft rules' "${LINENO:-}" nft -f "$rules" || exit 1
[ ! -x "$hook" ] || hijpass_run_logged firewall 'NFT Hook' "${LINENO:-}" "$hook" || exit 1
hijpass_log INFO firewall "${LINENO:-}" 'Applied hijpass client nft rules'
