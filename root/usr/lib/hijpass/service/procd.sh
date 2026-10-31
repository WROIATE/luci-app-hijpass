#!/bin/sh
# 将当前选中的实例字段映射为原生 procd 参数；不组织启停流程。

hijpass_add_instance() {
    local id name user log shunt keys key value kind
    json_get_var id id
    json_get_var name name
    json_get_var user user
    json_get_var log log
    json_get_var shunt shunt
    json_get_type kind command
    [ -n "$id" ] && [ -n "$name" ] && [ "$kind" = array ] || {
        echo 'Invalid service instance: missing identity or command array' >&2
        return 1
    }
    json_select command
    json_get_keys keys
    set --
    for key in $keys; do
        json_get_var value "$key"
        set -- "$@" "$value"
    done
    json_select ..
    [ "$#" -gt 0 ] && [ -n "$1" ] || { echo 'Invalid service instance: empty command' >&2; return 1; }
    procd_open_instance "$id-$name"
    # 仅日志重定向需要 Shell；标准核心命令始终按 argv 传递，不重新拼接执行。
    procd_set_param command /usr/lib/hijpass/service/process.sh "$log" "$@"
    json_select env
    json_get_keys keys
    set --
    for key in $keys; do
        json_get_var value "$key"
        set -- "$@" "$value"
    done
    json_select ..
    [ "$#" -eq 0 ] || procd_set_param env "$@"
    procd_set_param user "$user"
    [ "$user" != "hijpass" ] || procd_set_param group hijpass
    procd_set_param respawn 10 5 2
    procd_set_param pidfile "/var/run/$id-$name.pid"
    if [ "$shunt" = "1" ]; then
        procd_set_param limits core=unlimited nofile="1000000 1000000"
    fi
    procd_close_instance
}
