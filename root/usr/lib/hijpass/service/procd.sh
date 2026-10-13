#!/bin/sh
# 共享的 procd 桥接，只消费 ucode 的 Instance 对象；此处不读取业务配置。
hijpass_start_instances() {
    local plan keys key old_namespace
    plan=$1
    json_set_namespace hijpass_plan old_namespace
    json_load "$plan" || { json_set_namespace "$old_namespace"; return 1; }
    json_select instances
    json_get_keys keys
    for key in $keys; do
        json_select "$key"
        hijpass_open_instance
        json_select ..
    done
    json_cleanup
    json_set_namespace "$old_namespace"
}

hijpass_open_instance() {
    local id name user log shunt keys key value
    json_get_var id id
    json_get_var name name
    json_get_var user user
    json_get_var log log
    json_get_var shunt shunt
    procd_open_instance "$id-$name"
    json_select command
    json_get_keys keys
    set --
    for key in $keys; do
        json_get_var value "$key"
        set -- "$@" "$value"
    done
    json_select ..
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
