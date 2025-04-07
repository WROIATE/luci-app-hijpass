include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-hijpass
PKG_VERSION:=25.4.6
PKG_RELEASE:=1
LUCI_TITLE:=LuCI support for HiJpass
LUCI_PKGARCH:=all
LUCI_DEPENDS:= +curl +sing-box +xray-core \
	+kmod-nft-socket +kmod-nft-tproxy +kmod-nft-nat

PKG_CONFIG_DEPENDS:= \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Geoview \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Hysteria \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_V2ray_Geodata

define Package/$(PKG_NAME)
  USERID:=root=0:hijpass=4396
endef

define Package/$(PKG_NAME)/config
menu "Configuration"
	depends on PACKAGE_$(PKG_NAME)

config PACKAGE_$(PKG_NAME)_INCLUDE_Hysteria
	bool "Include Hysteria"
	select PACKAGE_hysteria
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_V2ray_Geodata
	bool "Include V2ray_Geodata"
	select PACKAGE_v2ray-geoip
	select PACKAGE_v2ray-geosite
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Geoview
	bool "Include Geoview"
	select PACKAGE_geoview
	default y if aarch64||arm||i386||x86_64

endmenu
endef

define Package/$(PKG_NAME)/conffiles
/etc/hijpass/fw4-template.nft
/etc/hijpass/white-v4.conf
/etc/hijpass/white-v6.conf
/etc/hijpass/shunt.json
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