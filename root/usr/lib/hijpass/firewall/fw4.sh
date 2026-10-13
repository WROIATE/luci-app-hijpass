#!/bin/sh
# firewall4 的 script include 入口。
exec "${0%/*}/firewall.sh" apply "$@"
