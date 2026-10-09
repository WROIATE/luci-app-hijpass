#!/bin/sh
# Shell 管捕获进程与 trap/wait；ucode 管参数校验、UCI、nft 规则和 JSON/日志报告。
. /usr/share/libubox/jshn.sh
capture_tool="${0%/*}/trace-config.uc"
capture="$($capture_tool prepare "$$" "$@")" || exit 1
json_load "$capture" || exit 1
json_get_vars directory mode client seconds method url tcpdump iface filter
nft_pid= log_pid= tcpdump_pid= request_pid=
cleaned=0

cleanup() {
    [ "$cleaned" -eq 0 ] || return
    cleaned=1
    # 先停止并回收生产日志的进程，tcpdump 退出时会刷新最后一批捕获内容。
    for pid in $request_pid $nft_pid $log_pid $tcpdump_pid; do
        kill "$pid" 2>/dev/null || :
    done
    for pid in $request_pid $nft_pid $log_pid $tcpdump_pid; do
        wait "$pid" 2>/dev/null || :
    done
    "$capture_tool" finish "$directory"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

nft monitor trace >"$directory/nft.trace" 2>&1 &
nft_pid=$!
if command -v logread >/dev/null 2>&1; then
    logread -f >"$directory/system.log" 2>&1 &
    log_pid=$!
fi
if [ "$tcpdump" = 1 ]; then
    tcpdump -l -n -i "$iface" "$filter" >"$directory/tcpdump.log" 2>"$directory/tcpdump.err" &
    tcpdump_pid=$!
fi

printf 'Trace is active. Generate traffic on the selected client during capture.\n'
# 先让 nft/tcpdump 进入监听，再开始请求或客户端捕获窗口。
sleep 0.25
if [ "$mode" = client ]; then
    sleep "$seconds" &
    request_pid=$!
    wait "$request_pid"
else
    set -- curl -sS --max-time "$seconds" -o /dev/null -w 'http_code=%{http_code}\nremote_ip=%{remote_ip}\nremote_port=%{remote_port}\ntime_total=%{time_total}\n'
    [ "$method" != HEAD ] || set -- "$@" -I
    "$@" -- "$url" >"$directory/curl.out" 2>"$directory/curl.err" &
    request_pid=$!
    wait "$request_pid"
    printf '%s\n' "$?" >"$directory/curl.exit"
fi
request_pid=
# 清理错误需要反馈给后台任务；再次触发 EXIT trap 时 cleanup 已标记完成。
cleanup
