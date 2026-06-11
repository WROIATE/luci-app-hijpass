#!/bin/sh

[ -z "$2" ] && exit 1

CLIENT_DIR=$(uci -q get hijpass.@hijpass[0].client_dir || echo '/etc/hijpass/client')
SERVER_DIR=$(uci -q get hijserver.@hijserver[0].server_dir || echo '/etc/hijpass/server')

remove_node_file() {
  local dir="$1"
  local section_id="$2"
  local keep_path="$3"

  for file in "${dir}/"*-"${section_id}".json; do
    [ -e "$file" ] || continue
    [ -n "$keep_path" ] && [ "$file" = "$keep_path" ] && continue
    rm -f "$file"
  done
}

case "$1" in
"proxy")
  remove_node_file "$CLIENT_DIR" "$2" "$3"
  ;;
"server")
  remove_node_file "$SERVER_DIR" "$2" "$3"
  ;;
esac
