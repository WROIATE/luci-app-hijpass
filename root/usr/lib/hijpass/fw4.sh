#!/bin/sh

. /usr/lib/hijpass/log.sh

log_debug "$0"

NFT_CONF=/etc/hijpass/fw4-rules.nft
TABLE_NAME=hijpass

if nft list tables | grep -q "$TABLE_NAME"; then
    log_info "Deleting existing table: $TABLE_NAME"
    nft delete table inet "$TABLE_NAME"
fi

if [ -f "$NFT_CONF" ]; then
    log_info "Loading nftables rules from: $NFT_CONF"
    nft -f $NFT_CONF
fi