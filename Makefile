include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-hijpass
PKG_VERSION:=25.4.6
PKG_RELEASE:=1
LUCI_TITLE:=LuCI support for HiJpass
LUCI_PKGARCH:=all
LUCI_DEPENDS:= +curl +sing-box +xray-core \
	+kmod-nft-socket +kmod-nft-tproxy +kmod-nft-nat \
	+v2ray-geosite +v2ray-geoip +geoview +hysteria

define Package/$(PKG_NAME)/conffiles
/etc/hijpass/fw4-template.nft
/etc/hijpass/shunt.json
/etc/hijpass/rules/domain-direct.txt
/etc/hijpass/rules/domain-proxy.txt
/etc/hijpass/rules/ip-direct.txt
/etc/hijpass/rules/ip-proxy.txt
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if ! grep -q "^hijpass:" /etc/passwd; then
    if ! grep -q "^hijpass:" /etc/group; then
        echo "hijpass:x:4396:hijpass" >> /etc/group
    fi
    echo "hijpass:x:0:4396:hijpass:/var/run/hijpass:/bin/false" >> /etc/passwd
    echo "hijpass:x:0:0:99999:7:::" >> /etc/shadow
fi
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
rm /etc/hijpass/fw4-rules.nft
uci -q batch <<-EOF >/dev/null
	delete firewall.hijapss
	commit firewall
EOF
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature