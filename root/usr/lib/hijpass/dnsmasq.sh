#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

log_debug "$0"

DNSMASQ_UCI_CONFIG="$(uci -q show "dhcp.@dnsmasq[0]" | awk 'NR==1 {split($0, conf, /[.=]/); print conf[2]}')"
if [ -f "/tmp/etc/dnsmasq.conf.$DNSMASQ_UCI_CONFIG" ]; then
    DNSMASQ_DIR="$(awk -F '=' '/^conf-dir=/ {print $2}' "/tmp/etc/dnsmasq.conf.$DNSMASQ_UCI_CONFIG")/dnsmasq-hijpass.d"
else
    DNSMASQ_DIR="/tmp/dnsmasq.d/dnsmasq-hijpass.d"
fi

set_dnsmasq() {
    remove_dnsmasq
    mkdir -p "$DNSMASQ_DIR"

    port=$(uci -q get hijpass.@shunt[0].dns_port || :)
    dns_rules="
no-poll
no-resolv
server=/#/127.0.0.1#$port
"
    echo "$dns_rules" >"$DNSMASQ_DIR/hijpass.conf"
    log_info "Successfully added dnsmasq conf"
}

remove_dnsmasq() {
    rm -rf "$DNSMASQ_DIR"
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
