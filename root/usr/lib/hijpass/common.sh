#!/bin/sh

# LuCI 包的安装路径固定，各功能入口共用这个只读目录常量。
readonly HIJPASS_LIB=/usr/lib/hijpass

# Shell 只用 jshn 消费业务对象，不把 JSON 当成命令执行，也不使用 eval。
. /usr/share/libubox/jshn.sh
hijpass_data() {
    # -- 分隔解释器选项和业务参数，兼容旧版本以及 glibc 宿主机的 getopt。
    ucode -S -- "$@"
}
hijpass_error() { hijpass_data "$HIJPASS_LIB/resultcli.uc" error "$1"; }
