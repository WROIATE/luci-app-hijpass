#!/bin/sh

# 功能入口负责命令执行；相邻 ucode 脚本只校验、转换及生成数据。
. /usr/lib/hijpass/common.sh

data="$HIJPASS_LIB/rules/rulescli.uc"
action=${1:-update}
[ "$#" -eq 0 ] || shift
if [ "$action" = query ]; then hijpass_data "$data" query "$@"; exit $?; fi
# 由实际更新进程持有锁。curl 等短期子进程继承锁，服务启动命令关闭 fd 9。
mkdir -p "$HIJPASS_JOB_ROOT" && chmod 700 "$HIJPASS_JOB_ROOT" || exit 1
exec 9>"$HIJPASS_JOB_ROOT/rules.lock"
if ! flock -n 9; then
    hijpass_data "$data" busy
    exit 75
fi
if [ "${1:-}" = --scheduled ]; then HIJPASS_UPDATE_SOURCE=scheduled; shift; fi
config_directory=
previous=
for argument in "$@"; do
    [ "$previous" != --configdir ] || config_directory=$argument
    previous=$argument
done
started=$(date +%s)
hijpass_log INFO rules "${LINENO:-}" "Update started: action=$action, source=${HIJPASS_UPDATE_SOURCE:-manual}"
plan=$(hijpass_data "$data" plan "$action" "$@") || { hijpass_log ERROR rules "${LINENO:-}" 'Cannot prepare update plan: invalid configuration'; hijpass_error 'invalid rules configuration'; exit 1; }
json_load "$plan" || exit 1
json_get_vars timeout retries enabled
connect_timeout=$timeout
[ "$connect_timeout" -le 10 ] || connect_timeout=10
json_select jobs
json_get_keys jobs
work=$(mktemp -d /tmp/hijpass-rules.XXXXXX) || exit 1
temp=
completed=0
trap 'if [ -n "$temp" ]; then rm -f "$temp" "$temp.text"; fi; rm -rf "$work"' EXIT
for job in $jobs; do
    json_select "$job"
    json_get_vars key kind path
    json_select urls
    json_get_keys urls
    valid=0
    sources=0
    source_index=0
    total_sources=0
    resource_started=$(date +%s)
    for entry in $urls; do total_sources=$((total_sources + 1)); done
    hijpass_log INFO rules "${LINENO:-}" "$key: downloading from $total_sources source(s), timeout=${timeout}s, attempts=$retries"
    : >"$work/merged"
    : >"$work/curl-error"
    if [ -n "$path" ] && [ -n "$urls" ] && mkdir -p "$(dirname -- "$path")"; then
        temp=$(mktemp "$path.new.XXXXXX") || temp=
        if [ -n "$temp" ]; then
            for entry in $urls; do
                source_index=$((source_index + 1))
                json_get_var url "$entry"
                case "$url" in http://*|https://*) ;; *) continue ;; esac
                attempt=0
                downloaded=0
                # 所有资源共用下载重试；文本资源的合并由 ucode 完成。
                while [ "$attempt" -lt "$retries" ]; do
                    # timeout 限制整次传输；连接最多等待 10 秒，重试错误只保留最后一次。
                    if curl -f -sS -L --connect-timeout "$connect_timeout" --max-time "$timeout" -o "$temp" -- "$url" 2>"$work/curl-error" && [ "$(wc -c <"$temp")" -gt 100 ]; then
                        downloaded=1
                        break
                    fi
                    attempt=$((attempt + 1))
                    hijpass_log WARN rules "${LINENO:-}" "$key: source $source_index attempt $attempt/$retries failed"
                    [ "$attempt" -ge "$retries" ] || sleep 2
                done
                if [ "$downloaded" -ne 1 ]; then
                    hijpass_log WARN rules "${LINENO:-}" "$key: source $source_index unavailable"
                    continue
                fi
                if [ "$kind" = geo ]; then
                    probe=example.org
                    [ "$key" != geoip ] || probe=1.1.1.1
                    if geoview -type "$key" -action lookup -input "$temp" -value "$probe" >/dev/null 2>&1; then
                        valid=1; sources=$((sources + 1))
                        hijpass_log INFO rules "${LINENO:-}" "$key: source $source_index downloaded and verified"
                        break
                    fi
                elif hijpass_data "$data" normalize "$kind" "$temp" >"$work/normalized" && grep -q '[^[:space:]]' "$work/normalized"; then
                    cat "$work/normalized" >>"$work/merged" || { valid=0; break; }
                    valid=1
                    sources=$((sources + 1))
                    hijpass_log INFO rules "${LINENO:-}" "$key: source $source_index downloaded and normalized"
                    continue
                fi
                hijpass_log WARN rules "${LINENO:-}" "$key: source $source_index returned invalid or empty data"
            done
            if [ "$valid" -eq 1 ]; then
                if [ "$kind" = geo ]; then
                    chmod 644 "$temp" && mv -f "$temp" "$path" || valid=0
                else
                    hijpass_data "$data" merge "$work/merged" >"$temp.text" && chmod 644 "$temp.text" && mv -f "$temp.text" "$path" || valid=0
                fi
            fi
            rm -f "$temp" "$temp.text"
            temp=
        fi
    fi
    if [ "$valid" -eq 1 ]; then
        completed=$((completed + 1))
        counts="bytes=$(wc -c <"$path")"
        [ "$kind" = geo ] || counts="$counts, entries=$(wc -l <"$path")"
        hijpass_log INFO rules "${LINENO:-}" "$key: installed, sources=$sources/$total_sources, $counts, elapsed=$(($(date +%s) - resource_started))s"
    else
        hijpass_log ERROR rules "${LINENO:-}" "$key: update failed; previous file retained
$(head -c 8192 "$work/curl-error")"
        hijpass_data "$data" result "$key"
        exit 1
    fi
    json_select ..
    json_select ..
done
if [ "$action" = update ] && [ "$enabled" = 1 ] && [ "$completed" -gt 0 ]; then
    hijpass_log INFO rules "${LINENO:-}" 'Applying updated resources: restarting service'
    if ! hijpass_step rules 'Service restart' "${LINENO:-}" /etc/init.d/hijpass restart; then
        hijpass_data "$data" result restart
        exit 1
    fi
fi
hijpass_log INFO rules "${LINENO:-}" "Update finished: installed=$completed, failed=0, elapsed=$(($(date +%s) - started))s"
hijpass_data "$data" result
