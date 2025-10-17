#!/bin/sh

. /usr/lib/hijpass/app-logger.sh

DNS_SERVICE=$(uci -q get hijpass.@dns[0].dns_service)
[ "$DNS_SERVICE" != "dnsmasq" ] && exit 0
DNSMASQ_SECTION_ID=$(uci -q show dhcp.@dnsmasq[0] | grep 'dnsmasq' | awk -F '[.=]' '{print $2}')
[ -z "$DNSMASQ_SECTION_ID" ] && exit 0
log_debug "$0"

GFW_FILE_PATH=$(uci -q get hijpass.@hijpass[0].gfw_list)
CHN_FILE_PATH=$(uci -q get hijpass.@hijpass[0].chn_list)
DOMAIN_PROXY_FILE_PATH=$(uci -q get hijpass.@hijpass[0].domain_proxy)
DOMAIN_DIRECT_FILE_PATH=$(uci -q get hijpass.@hijpass[0].domain_direct)
ENABLE_GFW=$(uci -q get hijpass.@dns[0].use_gfw)
ENABLE_CHN=$(uci -q get hijpass.@dns[0].use_chn)
DIRECT_DNS=$(uci -q get hijpass.@dns[0].direct_dns)
PROXY_DNS=$(uci -q get hijpass.@dns[0].proxy_dns)

DNSMASQ_CONF="/tmp/dnsmasq.${DNSMASQ_SECTION_ID}.d/hijpass.conf"

gen_proxy_rules() {
    local rules

    # 批量处理GFW域名列表
    if [ "$ENABLE_GFW" = "1" ] && [ -f "$GFW_FILE_PATH" ]; then
        local gfw_rules
        gfw_rules=$(grep -v '^\s*$\|^\s*#' "$GFW_FILE_PATH" |
            sed 's/^/nftset=\//' |
            sed 's/$/\/4#inet#hijpass#gfwlist4list,6#inet#hijpass#gfwlist6list/')
        rules="$rules
$gfw_rules"
    fi

    # 批量处理代理域名规则
    if [ -f "$DOMAIN_PROXY_FILE_PATH" ]; then
        local proxy_rules
        proxy_rules=$(grep -v '^\s*$\|^\s*#' "$DOMAIN_PROXY_FILE_PATH" |
            sed 's/^/nftset=\//' |
            sed 's/$/\/4#inet#hijpass#dnsproxy4list,6#inet#hijpass#dnsproxy6list/')
        rules="$rules
$proxy_rules"
    fi

    echo "$rules"
}

gen_direct_rules() {
    local rules

    # 批量处理CHN域名列表
    if [ "$ENABLE_CHN" = "1" ] && [ -f "$CHN_FILE_PATH" ]; then
        local chn_rules
        chn_rules=$(grep -v '^\s*$\|^\s*#' "$CHN_FILE_PATH" |
            sed 's/^/nftset=\//' |
            sed 's/$/\/4#inet#hijpass#chn4list,6#inet#hijpass#chn6list/')
        rules="$rules
$chn_rules"
    fi

    # 批量处理直连域名规则
    if [ -f "$DOMAIN_DIRECT_FILE_PATH" ]; then
        local direct_rules
        direct_rules=$(grep -v '^\s*$\|^\s*#' "$DOMAIN_DIRECT_FILE_PATH" |
            sed 's/^/nftset=\//' |
            sed 's/$/\/4#inet#hijpass#dnsbypass4list,6#inet#hijpass#dnsbypass6list/')
        rules="$rules
$direct_rules"
    fi

    echo "$rules"
}

gen_upstream_rules() {
    local rules
    if [ "$DIRECT_DNS" = "custom" ]; then
        DIRECT_DNS="$(uci -q get hijpass.@dns[0].direct_dns_custom)"
    fi
    if [ "$DIRECT_DNS" = "system" ]; then
        DIRECT_DNS=""
    fi
    if [ -n "$DIRECT_DNS" ]; then
        rules="$rules
server=$DIRECT_DNS"
    fi
    if [ "$PROXY_DNS" = "custom" ]; then
        PROXY_DNS="$(uci -q get hijpass.@dns[0].proxy_dns_custom)"
    fi
    if [ -n "$PROXY_DNS" ]; then
        rules="$rules
server=$PROXY_DNS"
        # 批量处理GFW域名的DNS服务器配置
        if [ "$ENABLE_GFW" = "1" ] && [ -f "$GFW_FILE_PATH" ]; then
            local gfw_dns_rules
            gfw_dns_rules=$(grep -v '^\s*$\|^\s*#' "$GFW_FILE_PATH" |
                sed "s/^/server=\//" |
                sed "s/$/\/$PROXY_DNS/")
            rules="$rules
$gfw_dns_rules"
        fi

        # 批量处理代理域名的DNS服务器配置
        if [ -f "$DOMAIN_PROXY_FILE_PATH" ]; then
            local proxy_dns_rules
            proxy_dns_rules=$(grep -v '^\s*$\|^\s*#' "$DOMAIN_PROXY_FILE_PATH" |
                sed "s/^/server=\//" |
                sed "s/$/\/$PROXY_DNS/")
            rules="$rules
$proxy_dns_rules"
        fi
    fi
    echo "$rules"
}

reset_dnsmasq() {
    remove_dnsmasq
    local proxy_rules direct_rules upstream_rules dns_rules
    proxy_rules=$(gen_proxy_rules)
    direct_rules=$(gen_direct_rules)
    upstream_rules=$(gen_upstream_rules)
    dns_rules="
no-poll
no-resolv
clear-on-reload
$upstream_rules
$proxy_rules
$direct_rules
"
    echo "$dns_rules" >"$DNSMASQ_CONF"
    log_info "Successfully added dnsmasq conf"
}

remove_dnsmasq() {
    rm -rf "$DNSMASQ_CONF"
    log_info "Successfully removed dnsmasq conf"
}

case "$1" in
reset)
    reset_dnsmasq
    ;;
remove)
    remove_dnsmasq
    ;;
esac
