#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

data="$HIJPASS_LIB/core/releasecli.uc"
action=${1:-}; core=${2:-}
case "$core" in xray|sing-box) ;; *) hijpass_error 'core action and name are required'; exit 1 ;; esac
case "$action" in version|latest|update) ;; *) hijpass_error 'unknown core update action'; exit 1 ;; esac
work=$(mktemp -d /tmp/hijpass-update.XXXXXX) || exit 1
temp=
trap 'if [ -n "$temp" ]; then rm -f "$temp"; fi; rm -rf "$work"' EXIT
if [ "$action" = version ]; then
    : >"$work/version"
    [ ! -x "/usr/bin/$core" ] || "/usr/bin/$core" version >"$work/version" 2>/dev/null || : >"$work/version"
    hijpass_data "$data" version "$core" "$work/version"
    exit $?
fi
url=$(hijpass_data "$data" source "$core") || exit 1
curl -f -sS -L --max-time 10 "$url" >"$work/release" || { hijpass_error 'cannot fetch core release'; exit 1; }
if [ "$action" = latest ]; then hijpass_data "$data" latest "$core" "$work/release"; exit $?; fi
plan=$(hijpass_data "$data" plan "$core" "$work/release" "$(uname -m)") || { printf '%s\n' "$plan"; exit 1; }
json_load "$plan" || exit 1
json_get_vars version number name url digest destination archive
download="$work/$name"
curl -f -sS -L --max-time 120 -o "$download" -- "$url" || { hijpass_error 'core download failed'; exit 1; }
actual=$(sha256sum "$download") || { hijpass_error 'cannot checksum archive'; exit 1; }
actual=${actual%% *}
[ "$actual" = "$digest" ] || { hijpass_error 'archive checksum verification failed'; exit 1; }
# 只提取目标核心，不展开其它归档成员；二进制始终流式复制。
if [ "$archive" = zip ]; then
    unzip -q "$download" xray -d "$work" || { hijpass_error 'cannot extract core'; exit 1; }
    binary="$work/xray"
else
    tar -tzf "$download" >"$work/members" || { hijpass_error 'invalid core archive'; exit 1; }
    member=$(hijpass_data "$data" member "$core" "$work/members") || exit 1
    tar -xzf "$download" -C "$work" "$member" || { hijpass_error 'cannot extract core'; exit 1; }
    binary="$work/$member"
fi
chmod 755 "$binary" && "$binary" version >"$work/version" || { hijpass_error 'binary verification failed'; exit 1; }
checked=$(hijpass_data "$data" version "$core" "$work/version") || exit 1
json_load "$checked" || exit 1
json_get_var installed version
[ "$installed" = "$number" ] || { hijpass_error 'binary verification failed'; exit 1; }
# 同目录临时文件验证成功后再替换，失败始终保留原核心。
temp="$destination.new.$$"
cp "$binary" "$temp" && chmod 755 "$temp" && mv -f "$temp" "$destination" || { hijpass_error 'install failed'; exit 1; }
temp=
hijpass_data "$data" result "$core" "$version"
