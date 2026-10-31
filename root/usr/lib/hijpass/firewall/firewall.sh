#!/bin/sh
# reset：生成、校验并写入规则；remove：删除规则。成功后统一重载 fw4。
. /usr/lib/hijpass/common.sh

[ "$#" -ge 1 ] || { echo "usage: $0 reset|remove" >&2; exit 1; }
action=$1
shift
case "$action" in
    reset)
        hijpass_run_logged firewall 'Generate rules' "${LINENO:-}" hijpass_run_ucode "$HIJPASS_LIB/firewall/generatecli.uc" "$@" || exit $? ;;
    remove)
        hijpass_run_logged firewall 'Remove rules' "${LINENO:-}" rm -f /etc/hijpass/fw4-rules.nft || exit $? ;;
    *) echo "unknown firewall action: $action" >&2; exit 1 ;;
esac
hijpass_run_logged firewall 'Reload rules' "${LINENO:-}" fw4 reload
