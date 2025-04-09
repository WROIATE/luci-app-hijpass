#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

log_debug "$0"

DNSMASQ_CONF="/tmp/dnsmasq.d/hijpass.conf"

set_dnsmasq() {
    remove_dnsmasq

    port=$(uci -q get hijpass.@shunt[0].dns_port || :)
    dns_rules="
no-poll
no-resolv
server=127.0.0.1#$port
"
    echo "$dns_rules" >"$DNSMASQ_CONF"
    log_info "Successfully added dnsmasq conf"
}

remove_dnsmasq() {
    rm -rf "$DNSMASQ_CONF"
    log_info "Successfully removed dnsmasq conf"
}

case "$1" in
    set)
        set_dnsmasq
    ;;
    remove)
        remove_dnsmasq
    ;;
esac
