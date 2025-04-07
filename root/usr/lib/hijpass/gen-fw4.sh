#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

log_debug "$0"

TPROXY_MARK=0x1
TPROXY_PROTO=$(uci -q get hijpass.@transport[0].tproxy_proto)
TPROXY_PORT=$(uci -q get hijpass.@transport[0].shunt_port)
RESOLV_FILE=$(uci -q get dhcp.@dnsmasq[0].resolvfile)
CONF_PATH="/etc/hijpass"
HIJPASS_USER="hijpass"

log_debug "Generating fw4 rules with mark:$TPROXY_MARK port:$TPROXY_PORT proto:$TPROXY_PROTO"

WHITE_V4_CONF=white-v4.conf
WHITE_V6_CONF=white-v6.conf

WHITE_V4_LIST=$(cat "$CONF_PATH/$WHITE_V4_CONF")
WHITE_V6_LIST=$(cat "$CONF_PATH/$WHITE_V6_CONF")

FW4_TEMPLATE=$(cat "$CONF_PATH/fw4-template.nft")

DNS_V4=
DNS_V6=

if [ -f "$RESOLV_FILE" ]; then
    DNS_V4=$(grep <"$RESOLV_FILE" -E -o "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | sort -u | grep -v 0.0.0.0 | grep -v 127.0.0.1)
    DNS_V6=$(grep <"$RESOLV_FILE" -E "([A-Fa-f0-9]{1,4}::?){1,7}[A-Fa-f0-9]{1,4}" | awk -F % '{print $1}' | awk -F " " '{print $2}' | sort -u | grep -v -Fx ::1 | grep -v -Fx ::)
fi

LOCAL_V4_CIDR=$(ip address | grep -w inet | awk '{print $2}')
LOCAL_V6_CIDR=$(ip address | grep -w inet6 | awk '{print $2}')

IP_V4_LIST=$(echo "$DNS_V4
$WHITE_V4_LIST
$LOCAL_V4_CIDR
" | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//')

IP_V6_LIST=$(echo "$DNS_V6
$WHITE_V6_LIST
$LOCAL_V6_CIDR
" | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//')

fw_rules="
define HIJPASS_USER = $HIJPASS_USER
define TPROXY_MARK = $TPROXY_MARK
define TPROXY_PORT = $TPROXY_PORT
define TPROXY_PROTO = { $TPROXY_PROTO }
define IP_V4_LIST = {
$IP_V4_LIST
}
define IP_V6_LIST = {
$IP_V6_LIST
}

$FW4_TEMPLATE
"
echo "$fw_rules"
