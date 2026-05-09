#!/bin/sh

[ -z "$2" ] && exit 1

CLIENT_DIR=$(uci -q get hijpass.@hijpass[0].client_dir || echo '/etc/hijpass/client')
SERVER_DIR=$(uci -q get hijserver.@hijserver[0].server_dir || echo '/etc/hijpass/server')

case "$1" in
"proxy")
  rm -f "${CLIENT_DIR}/"*-"$2".json
  ;;
"server")
  rm -f "${SERVER_DIR}/"*-"$2".json
  ;;
esac
