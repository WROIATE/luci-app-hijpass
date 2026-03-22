#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

NFT_GEN_SCRIPT="/usr/lib/hijpass/gen-nft.sh"
NFT_CONF="/etc/hijpass/fw4-rules.nft"

NFT_RULES=$($NFT_GEN_SCRIPT)

case "$1" in
reset)
    cat <<-EOF >"$NFT_CONF"
		$NFT_RULES
	EOF
    ;;
remove)
    rm -f "$NFT_CONF"
    ;;
esac

if ! fw4 reload >/dev/null 2>&1; then
    log_error "Failed to reload firewall rules"
    exit 1
fi