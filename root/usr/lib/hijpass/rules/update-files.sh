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
work=$(mktemp -d /tmp/hijpass-rules.XXXXXX) || { hijpass_error 'cannot create rules workspace'; exit 1; }
temp=
completed=0
trap 'if [ -n "$temp" ]; then rm -f "$temp" "$temp.text"; fi; rm -rf "$work"' EXIT

# 来源不可用可以按配置重试；本地处理、写入、替换失败必须立即退出。
fail_resource() {
    local line="$1" phase="$2" detail=
    [ ! -s "$3" ] || detail=$(head -c 8192 "$3")
    hijpass_log ERROR rules "$line" "$key: $phase failed; previous file retained${detail:+
$detail}"
    hijpass_data "$data" result "$key"
    exit 1
}

for job in $jobs; do
    json_select "$job"
    json_get_vars key kind path
    json_select urls
    json_get_keys urls
    sources=0
    source_index=0
    total_sources=0
    resource_started=$(date +%s)
    for entry in $urls; do total_sources=$((total_sources + 1)); done
    hijpass_log INFO rules "${LINENO:-}" "$key: downloading from $total_sources source(s), timeout=${timeout}s, attempts=$retries"
    : >"$work/error" || fail_resource "${LINENO:-}" 'Prepare diagnostics' "$work/error"
    : >"$work/merged" || fail_resource "${LINENO:-}" 'Prepare merged data' "$work/error"
    : >"$work/curl-error" || fail_resource "${LINENO:-}" 'Prepare download diagnostics' "$work/error"
    [ -n "$urls" ] || fail_resource "${LINENO:-}" 'Download' "$work/curl-error"
    mkdir -p "$(dirname -- "$path")" 2>"$work/error" || fail_resource "${LINENO:-}" 'Prepare destination' "$work/error"
    temp=$(mktemp "$path.new.XXXXXX" 2>"$work/error") || fail_resource "${LINENO:-}" 'Create staged file' "$work/error"
    for entry in $urls; do
        source_index=$((source_index + 1))
        json_get_var url "$entry"
        case "$url" in http://*|https://*) ;; *) continue ;; esac
        attempt=0
        downloaded=0
        while [ "$attempt" -lt "$retries" ]; do
            exec 7>"$work/curl-error" || fail_resource "${LINENO:-}" 'Prepare download diagnostics' "$work/error"
            if curl -f -sS -L --connect-timeout "$connect_timeout" --max-time "$timeout" -o "$temp" -- "$url" 2>&7; then
                code=0
            else
                code=$?
            fi
            exec 7>&-
            # curl 23 是本地写入失败，不能把它当成下载源故障继续尝试。
            [ "$code" -ne 23 ] || fail_resource "${LINENO:-}" 'Save download' "$work/curl-error"
            if [ "$code" -eq 0 ]; then
                bytes=$(wc -c <"$temp" 2>"$work/error") || fail_resource "${LINENO:-}" 'Read downloaded file' "$work/error"
                if [ "$bytes" -gt 100 ]; then downloaded=1; break; fi
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
                sources=$((sources + 1))
                hijpass_log INFO rules "${LINENO:-}" "$key: source $source_index downloaded and verified"
                break
            fi
        else
            hijpass_data "$data" normalize "$kind" "$temp" >"$work/normalized" 2>"$work/error" || fail_resource "${LINENO:-}" 'Normalize download' "$work/error"
            if grep -q '[^[:space:]]' "$work/normalized" 2>"$work/error"; then
                cat "$work/normalized" >>"$work/merged" 2>"$work/error" || fail_resource "${LINENO:-}" 'Save merged data' "$work/error"
                sources=$((sources + 1))
                hijpass_log INFO rules "${LINENO:-}" "$key: source $source_index downloaded and normalized"
                continue
            else
                code=$?
                [ "$code" -eq 1 ] || fail_resource "${LINENO:-}" 'Read normalized data' "$work/error"
            fi
        fi
        hijpass_log WARN rules "${LINENO:-}" "$key: source $source_index returned invalid or empty data"
    done
    [ "$sources" -gt 0 ] || fail_resource "${LINENO:-}" 'Download' "$work/curl-error"
    staged=$temp
    if [ "$kind" != geo ]; then
        staged=$temp.text
        hijpass_data "$data" merge "$work/merged" >"$staged" 2>"$work/error" || fail_resource "${LINENO:-}" 'Save processed data' "$work/error"
    fi
    chmod 644 "$staged" 2>"$work/error" || fail_resource "${LINENO:-}" 'Set staged permissions' "$work/error"
    bytes=$(wc -c <"$staged" 2>"$work/error") || fail_resource "${LINENO:-}" 'Read staged file' "$work/error"
    counts="bytes=$bytes"
    if [ "$kind" != geo ]; then
        entries=$(wc -l <"$staged" 2>"$work/error") || fail_resource "${LINENO:-}" 'Read staged entries' "$work/error"
        counts="$counts, entries=$entries"
    fi
    mv -f "$staged" "$path" 2>"$work/error" || fail_resource "${LINENO:-}" 'Replace resource' "$work/error"
    rm -f "$temp" "$temp.text"
    temp=
    completed=$((completed + 1))
    hijpass_log INFO rules "${LINENO:-}" "$key: installed, sources=$sources/$total_sources, $counts, elapsed=$(($(date +%s) - resource_started))s"
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
