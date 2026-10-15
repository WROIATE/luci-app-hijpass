include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-hijpass
PKG_VERSION:=26.9.6
PKG_RELEASE:=3
LUCI_TITLE:=LuCI support for HiJpass
LUCI_PKGARCH:=all

PKG_CONFIG_DEPENDS:= \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Hysteria \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_NaiveProxy \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Rust_Client \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Rust_Server \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_Shadow_TLS \
	CONFIG_PACKAGE_$(PKG_NAME)_INCLUDE_tuic_client

LUCI_DEPENDS:= +ca-bundle +curl +firewall4 +ip-full +rpcd +ubus +jshn \
	+sing-box +unzip +xray-core \
	+kmod-nft-socket +kmod-nft-tproxy +kmod-nft-nat \
	+v2ray-geosite +v2ray-geoip +geoview +chinadns-ng \
	+ucode +ucode-mod-fs +ucode-mod-uci +ucode-mod-resolv

define Package/$(PKG_NAME)/config
menu "Configuration"
	depends on PACKAGE_$(PKG_NAME)

config PACKAGE_$(PKG_NAME)_INCLUDE_Hysteria
	bool "Include Hysteria"
	select PACKAGE_hysteria
	default y if aarch64||x86_64

config PACKAGE_$(PKG_NAME)_INCLUDE_NaiveProxy
	bool "Include NaiveProxy"
	depends on !(arc||armeb||loongarch64||mips||mips64||powerpc||TARGET_gemini)
	select PACKAGE_naiveproxy
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Rust_Client
	bool "Include Shadowsocks Rust Client"
	depends on !i386
	select PACKAGE_shadowsocks-rust-sslocal
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Shadowsocks_Rust_Server
	bool "Include Shadowsocks Rust Server"
	depends on !i386
	select PACKAGE_shadowsocks-rust-ssserver
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_Shadow_TLS
	bool "Include Shadow-TLS"
	select PACKAGE_shadow-tls
	depends on aarch64||arm||x86_64
	default n

config PACKAGE_$(PKG_NAME)_INCLUDE_tuic_client
	bool "Include tuic-client"
	depends on aarch64||arm||i386||x86_64
	select PACKAGE_tuic-client
	default n

endmenu
endef

define Package/$(PKG_NAME)/conffiles
/etc/hijpass/firewall/pre-filter.ut
/etc/hijpass/firewall/out-route.ut
/etc/hijpass/firewall/tproxy-shunt.ut
/etc/hijpass/firewall/tproxy-mark.ut
/etc/hijpass/firewall/proxy-port-filter.ut
/etc/hijpass/firewall/dns-forward.ut
/etc/hijpass/firewall/dns-forward-output.ut
/etc/hijpass/hook/dns-hook.sh
/etc/hijpass/hook/nft-hook.sh
/etc/hijpass/rules/chn-list.txt
/etc/hijpass/rules/chn-route.txt
/etc/hijpass/rules/chn-route6.txt
/etc/hijpass/rules/domain-direct.txt
/etc/hijpass/rules/domain-proxy.txt
/etc/hijpass/rules/gfw-list.txt
/etc/hijpass/rules/ip-direct.txt
/etc/hijpass/rules/ip-proxy.txt
/etc/hijpass/shunt.json
/etc/config/hijpass
/etc/config/hijserver
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
/etc/init.d/hijpass stop
/etc/init.d/hijserver stop
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
uci -q batch <<-EOF >/dev/null
	delete firewall.hijpass
	commit firewall
EOF
exit 0
endef

# ucode 源文件由 LuCI 的 root 安装流程直接复制，整个包保持架构无关。
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
