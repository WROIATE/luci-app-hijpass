#!/bin/sh

check_port() {
	if echo "$1" | grep -Eq "^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$" >>/dev/null 2>&1; then
		if netstat -tlnp | grep -q ":$1 " >>/dev/null 2>&1; then
			return 0
		fi
	fi
	return 1
}

# 主函数
main() {
	local action="$1"
	shift
	case "$action" in
	"port")
		local result="{}"
		for p in "$@"; do
			if check_port "$p"; then
				result="$(echo "$result" | jq --arg k "$p" '.[$k] = true')"
			else
				result="$(echo "$result" | jq --arg k "$p" '.[$k] = false')"
			fi
		done
		echo "$result"
		;;
	*)
		echo -e "Usage: \n    $0 [port] args"
		exit 1
		;;
	esac
}

main "$@"
