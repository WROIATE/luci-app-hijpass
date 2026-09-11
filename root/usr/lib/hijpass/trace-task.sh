#!/bin/sh

# Short-lived RPC commands start and inspect a detached, bounded capture.
TASK_ROOT=/tmp/hijpass-trace-tasks
umask 077

fail() {
    printf '%s\n' "$*" >&2
    exit 1
}

action="$1"
shift

if [ "$action" = "start" ]; then
    mkdir -p "$TASK_ROOT" || fail "Cannot create trace task directory"
    # Finished/abandoned reports expire on the next run (or router reboot).
    find "$TASK_ROOT" -mindepth 1 -maxdepth 1 -type d -mmin +10 -exec rm -rf '{}' ';'
    task_dir="$(mktemp -d "$TASK_ROOT/XXXXXXXX")" || fail "Cannot create trace task"
    task_id="${task_dir##*/}"
    : >"$task_dir/stdout"
    : >"$task_dir/stderr"
    # Close every RPC pipe before detaching, otherwise file.exec keeps waiting.
    "$0" run "$task_id" "$@" </dev/null >/dev/null 2>&1 &
    printf '%s\n' "$!" >"$task_dir/pid"
    printf '%s\n' "$task_id"
    exit 0
fi

task_id="$1"
shift
case "$task_id" in
    ''|*[!A-Za-z0-9]*) fail "Invalid trace task ID" ;;
esac
[ "${#task_id}" -eq 8 ] || fail "Invalid trace task ID"
task_dir="$TASK_ROOT/$task_id"
[ -d "$task_dir" ] || fail "Trace task not found"

case "$action" in
    run)
        trap '' HUP
        "${0%/*}/trace-url.sh" "$@" >"$task_dir/stdout" 2>"$task_dir/stderr"
        code="$?"
        printf '%s\n' "$code" >"$task_dir/exit.tmp"
        mv "$task_dir/exit.tmp" "$task_dir/exit"
        ;;
    status)
        code=null
        running=true
        if [ -f "$task_dir/exit" ]; then
            code="$(cat "$task_dir/exit")"
            running=false
        elif [ -f "$task_dir/pid" ] && ! kill -0 "$(cat "$task_dir/pid")" 2>/dev/null; then
            code=1
            running=false
            printf 'Trace worker exited without a result\n' >>"$task_dir/stderr"
            printf '1\n' >"$task_dir/exit"
        fi
        jq -n --argjson running "$running" --argjson code "$code" \
            --rawfile stdout "$task_dir/stdout" --rawfile stderr "$task_dir/stderr" \
            '{running: $running, code: $code, stdout: $stdout, stderr: $stderr}'
        ;;
    release)
        [ -f "$task_dir/exit" ] || fail "Trace task has not finished"
        rm -rf "$task_dir"
        ;;
    *) fail "Unknown trace task action" ;;
esac
