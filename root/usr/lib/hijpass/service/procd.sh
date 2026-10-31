#!/bin/sh
# 共享的 procd 桥接，只消费 ucode 的 Instance 对象；此处不读取业务配置。

# 检查已校验的进程描述；在子 Shell 中解析，不修改调用方的 JSON 状态。
hijpass_has_instances() (
    local keys
    json_set_namespace hijpass_plan
    json_load "$1" && json_select instances || exit 1
    json_get_keys keys
    [ -n "$keys" ]
)

hijpass_add_instances() {
    local plan keys key old_namespace
    plan=$1
    json_set_namespace hijpass_plan old_namespace
    json_load "$plan" || { json_set_namespace "$old_namespace"; return 1; }
    json_select instances || { json_set_namespace "$old_namespace"; return 1; }
    json_get_keys keys
    for key in $keys; do
        json_select "$key"
        hijpass_add_instance
        json_select ..
    done
    json_cleanup
    json_set_namespace "$old_namespace"
}

# 仅检查标准核心命令。用户自定义 Shell 命令仍按原样交给 procd。
hijpass_check_configs() (
    local entries entry engine path keys key previous value kind
    json_set_namespace hijpass_check
    json_load "$1" || exit 1
    json_get_type kind instances
    [ "$kind" = array ] || { echo 'Invalid service plan: instances must be an array' >&2; exit 1; }
    json_select instances || exit 1
    json_get_keys entries
    for entry in $entries; do
        json_get_type kind "$entry"
        [ "$kind" = object ] || { echo 'Invalid service plan: instance must be an object' >&2; exit 1; }
        json_select "$entry"
        json_get_type kind command
        [ "$kind" = array ] || { echo 'Invalid service plan: command must be an array' >&2; exit 1; }
        json_select command
        json_get_var engine 1
        [ -n "$engine" ] || { echo 'Invalid service plan: command is empty' >&2; exit 1; }
        path=
        json_get_keys keys
        previous=
        for key in $keys; do
            json_get_var value "$key"
            [ "$previous" != -c ] || path=$value
            previous=$value
        done
        json_select ..
        case "$engine" in
            xray|sing-box)
                [ -n "$path" ] || exit 1
                json_select env
                json_get_keys keys
                set --
                for key in $keys; do json_get_var value "$key"; set -- "$@" "$value"; done
                json_select ..
                if [ "$engine" = xray ]; then
                    env "$@" xray run -test -c "$path" || exit 1
                else
                    env "$@" sing-box check -c "$path" || exit 1
                fi ;;
        esac
        json_select ..
    done
)

hijpass_add_instance() {
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
