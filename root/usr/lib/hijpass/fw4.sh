#!/bin/sh
# firewall4 以 Shell 方式运行 script include，这里只桥接到 ucode。
exec /usr/lib/hijpass/fw4.uc "$@"
