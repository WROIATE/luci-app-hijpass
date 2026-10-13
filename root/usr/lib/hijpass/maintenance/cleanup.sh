#!/bin/sh

# 仅删除选定 section 的旧配置；标识和保留路径先校验，避免宽泛 glob。
kind=${1:-}; id=${2:-}; keep=${3:-}
case "$id" in ''|*[!A-Za-z0-9_-]*) echo 'invalid section ID' >&2; exit 1 ;; esac
case "$kind" in
    proxy) directory=$(uci -q get hijpass.@hijpass[0].client_dir); directory=${directory:-/etc/hijpass/client} ;;
    server) directory=$(uci -q get hijserver.@hijserver[0].server_dir); directory=${directory:-/etc/hijpass/server} ;;
    *) echo 'unknown node kind' >&2; exit 1 ;;
esac
if [ -n "$keep" ]; then
    [ "$(dirname -- "$keep")" = "$directory" ] || { echo 'invalid keep path' >&2; exit 1; }
    case "${keep##*/}" in *-"$id".json) ;; *) echo 'invalid keep path' >&2; exit 1 ;; esac
fi
for path in "$directory"/*-"$id".json; do
    [ "$path" != "$keep" ] || continue
    [ ! -d "$path" ] || continue
    if [ -e "$path" ] || [ -L "$path" ]; then rm -f -- "$path" || exit 1; fi
done
