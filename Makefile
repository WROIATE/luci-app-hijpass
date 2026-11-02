include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-hijpass
PKG_VERSION:=26.9.6
PKG_RELEASE:=46
LUCI_TITLE:=LuCI support for HiJpass
LUCI_PKGARCH:=all
# esbuild 已压缩 JS；再次经过 jsmin 会改写 CodeMirror 中的正则表达式。
LUCI_MINIFY_JS:=0

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
/etc/hijpass/firewall.ut
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

# 默认副本不列入 conffiles；恢复默认始终读取当前软件包版本的模板。
define Build/FirewallDefault
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/root/etc/hijpass/firewall.ut $(PKG_BUILD_DIR)/root/usr/lib/hijpass/firewall/default.ut
endef
Hooks/Compile/Post += Build/FirewallDefault

# ucode 源文件由 LuCI 的 root 安装流程直接复制，整个包保持架构无关。
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
