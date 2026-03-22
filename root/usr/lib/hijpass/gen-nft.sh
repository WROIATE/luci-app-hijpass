#!/bin/sh

. /usr/lib/hijpass/app-logger.sh
. /lib/functions/network.sh

log_debug "$0"

TPROXY_MARK=0x1
TPROXY_SHUNT_MARK=0x3
TPROXY_PROTO=$(uci -q get hijpass.@firewall[0].tproxy_proto)
TPROXY_SHUNT_PORT=$(uci -q get hijpass.@firewall[0].shunt_port)
TPROXY_PORT=$(uci -q get hijpass.@firewall[0].proxy_port)

if [ -z "$TPROXY_SHUNT_PORT" ] && [ -z "$TPROXY_PORT" ]; then
    exit 0
fi

RESOLV_FILE=$(uci -q get dhcp.@dnsmasq[0].resolvfile || :)
IP_DIRECT_CONF=$(uci -q get hijpass.@hijpass[0].ip_direct || :)
IP_PROXY_CONF=$(uci -q get hijpass.@hijpass[0].ip_proxy || :)
CHN_ROUTE_FILE=$(uci -q get hijpass.@hijpass[0].chn_route || :)
CHN_ROUTE6_FILE=$(uci -q get hijpass.@hijpass[0].chn_route6 || :)
ENABLE_CHN_ROUTE=$(uci -q get hijpass.@firewall[0].use_chnroute || :)
ENABLE_GFW_LIST=$(uci -q get hijpass.@dns[0].use_gfw || :)
ENABLE_CHN_LIST=$(uci -q get hijpass.@dns[0].use_chn || :)
DNS_SERVICE=$(uci -q get hijpass.@dns[0].dns_service || :)
PROXY_MAC=$(uci -q get hijpass.@firewall[0].proxy_mac_list || :)
PROXY_INTERFACE=$(uci -q get hijpass.@firewall[0].proxy_iface_list || :)

LUA_SCRIPT="/usr/lib/hijpass/luci-utils.lua"
CONF_PATH="/etc/hijpass"
HIJPASS_USER="hijpass"

network_flush_cache
network_find_wan NET_IF
network_find_wan6 NET_IF6
network_get_physdev NET_L2D "${NET_IF}"
network_get_physdev NET_L2D6 "${NET_IF6}"

INPUT_WAN_L2_DEV=
if [ "$NET_L2D" != "br-lan" ]; then
    INPUT_WAN_L2_DEV="$NET_L2D"
fi

if [ "$NET_L2D6" != "br-lan" ]; then
    if [ -n "$INPUT_WAN_L2_DEV" ]; then
        INPUT_WAN_L2_DEV="$INPUT_WAN_L2_DEV, $NET_L2D6"
    else
        INPUT_WAN_L2_DEV="$NET_L2D6"
    fi
fi

log_debug "Generating fw4 rules with mark:$TPROXY_MARK proxy port:$TPROXY_PORT shunt port:$TPROXY_SHUNT_PORT proto:$TPROXY_PROTO"

IP_DIRECT_LIST=$([ -f "$IP_DIRECT_CONF" ] && cat "$IP_DIRECT_CONF" | grep -v -e '^\s*$' -e '^\s*#' || :)
IP_PROXY_LIST=$([ -f "$IP_PROXY_CONF" ] && cat "$IP_PROXY_CONF" | grep -v -e '^\s*$' -e '^\s*#' || :)

IP4_DIRECT_LIST=
IP6_DIRECT_LIST=
IP4_PROXY_LIST=
IP6_PROXY_LIST=

for ip in $IP_DIRECT_LIST; do
    type=$(lua "$LUA_SCRIPT" "iptype" "$ip")
    if [ "$type" = "4" ]; then
        IP4_DIRECT_LIST="$IP4_DIRECT_LIST
$ip"
    elif [ "$type" = "6" ]; then
        IP6_DIRECT_LIST="$IP6_DIRECT_LIST
$ip"
    else
        log_warn "Invalid IP address: $ip"
    fi
done

for ip in $IP_PROXY_LIST; do
    type=$(lua "$LUA_SCRIPT" "iptype" "$ip")
    if [ "$type" = "4" ]; then
        IP4_PROXY_LIST="$IP4_PROXY_LIST
$ip"
    elif [ "$type" = "6" ]; then
        IP6_PROXY_LIST="$IP6_PROXY_LIST
$ip"
    else
        log_warn "Invalid IP address: $ip"
    fi
done

FW4_TEMPLATE=$(cat "$CONF_PATH/fw4-template.nft")

DNS_V4=
DNS_V6=

if [ -f "$RESOLV_FILE" ]; then
    DNS_V4=$(grep <"$RESOLV_FILE" -E -o "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | sort -u | grep -v 0.0.0.0 | grep -v 127.0.0.1)
    DNS_V6=$(grep <"$RESOLV_FILE" -E "([A-Fa-f0-9]{1,4}::?){1,7}[A-Fa-f0-9]{1,4}" | awk -F % '{print $1}' | awk -F " " '{print $2}' | sort -u | grep -v -Fx ::1 | grep -v -Fx ::)
fi

LOCAL_V4_CIDR=$(ip address | grep -w inet | awk '{print $2}')
LOCAL_V6_CIDR=$(ip address | grep -w inet6 | awk '{print $2}')

CHN_ROUTE=
CHN_ROUTE6=

if [ "$ENABLE_CHN_ROUTE" = "1" ]; then
    CHN_ROUTE=$([ -f "$CHN_ROUTE_FILE" ] && cat "$CHN_ROUTE_FILE" | grep -v -e '^\s*$' -e '^\s*#' | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//' || :)
    CHN_ROUTE6=$([ -f "$CHN_ROUTE6_FILE" ] && cat "$CHN_ROUTE6_FILE" | grep -v -e '^\s*$' -e '^\s*#' | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//' || :)
fi

IP4_DIRECT_NFT_LIST=$(echo "$DNS_V4
$IP4_DIRECT_LIST
$LOCAL_V4_CIDR
" | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//')

IP6_DIRECT_NFT_LIST=$(echo "$DNS_V6
$IP6_DIRECT_LIST
$LOCAL_V6_CIDR
" | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//')

IP4_PROXY_NFT_LIST=$(echo "$IP4_PROXY_LIST" | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//')
IP6_PROXY_NFT_LIST=$(echo "$IP6_PROXY_LIST" | sort -u | awk 'NF {printf "%s,\n", $0}' | sed '$ s/,$//')

[ -n "$PROXY_INTERFACE" ] && PROXY_INTERFACE="${PROXY_INTERFACE// /,}"
[ -n "$PROXY_MAC" ] && PROXY_MAC="${PROXY_MAC// /,}"


fw_rules="
define HIJPASS_USER = $HIJPASS_USER
define TPROXY_MARK = $TPROXY_MARK
define TPROXY_PORT = $TPROXY_PORT
define TPROXY_SHUNT_MARK = $TPROXY_SHUNT_MARK
define TPROXY_SHUNT_PORT = $TPROXY_SHUNT_PORT
define TPROXY_PROTO = { $TPROXY_PROTO }
define WAN_DEV = { $INPUT_WAN_L2_DEV }
define IP4_DIRECT_NFT_LIST = { $IP4_DIRECT_NFT_LIST }
define IP6_DIRECT_NFT_LIST = { $IP6_DIRECT_NFT_LIST }
define IP4_PROXY_NFT_LIST = { $IP4_PROXY_NFT_LIST }
define IP6_PROXY_NFT_LIST = { $IP6_PROXY_NFT_LIST }
define IP4_CHNROUTE_LIST = { $CHN_ROUTE }
define IP6_CHNROUTE_LIST = { $CHN_ROUTE6 }
define PROXY_INTERFACE = { $PROXY_INTERFACE }
define PROXY_MAC = { $PROXY_MAC }

$FW4_TEMPLATE
"

if [ -z "$TPROXY_SHUNT_PORT" ]; then
    fw_rules=$(echo "$fw_rules" | grep -v "TPROXY_SHUNT_PORT")
    fw_rules=$(echo "$fw_rules" | grep -v "shunt mark")
    fw_rules=$(echo "$fw_rules" | grep -v "@chnroute")
    fw_rules=$(echo "$fw_rules" | grep -Ev "@chn.list")
fi

if [ -z "$TPROXY_PORT" ]; then
    fw_rules=$(echo "$fw_rules" | grep -v "TPROXY_PORT")
fi

if [ -z "$ENABLE_CHN_ROUTE" ]; then
    fw_rules=$(echo "$fw_rules" | grep -v "@chnroute")
    fw_rules=$(echo "$fw_rules" | sed '/set chnroute.list {/,/^    }/d')
fi

if [ -z "$ENABLE_GFW_LIST" ]; then
    fw_rules=$(echo "$fw_rules" | grep -v "@gfw")
    fw_rules=$(echo "$fw_rules" | sed '/set gfw.list {/,/^    }/d')
fi

if [ -z "$ENABLE_CHN_LIST" ]; then
    fw_rules=$(echo "$fw_rules" | grep -Ev "@chn.list")
    fw_rules=$(echo "$fw_rules" | sed '/set chn.list {/,/^    }/d')
fi

if [ "$DNS_SERVICE" = "custom" ]; then
    fw_rules=$(echo "$fw_rules" | grep -Ev "@dns.*\dlist")
    fw_rules=$(echo "$fw_rules" | sed '/set dns.*\dlist {/,/^    }/d')
fi

echo "$fw_rules"
