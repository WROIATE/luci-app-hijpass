#!/bin/sh

# 用法:
#   core-update.sh version <sing-box|xray>   — 输出本地版本号（JSON）
#   core-update.sh update  <sing-box|xray>   — 从 GitHub 下载最新版并替换

. /usr/lib/hijpass/app-logger.sh

ACTION="$1"
CORE="$2"

SINGBOX_BIN="/usr/bin/sing-box"
XRAY_BIN="/usr/bin/xray"

# ── 检测架构，sing-box 和 xray 的文件名规则不同 ─────────────────────
# sing-box: linux-amd64 / linux-arm64 / linux-armv7 / linux-mips-softfloat ...
# xray:     linux-64    / linux-arm64-v8a / linux-arm32-v7a / linux-mips32 ...
detect_arch() {
    local machine="$1"   # core name: sing-box or xray
    local m
    m=$(uname -m)
    if [ "$machine" = "xray" ]; then
        case "$m" in
            x86_64)        echo "linux-64" ;;
            aarch64|arm64) echo "linux-arm64-v8a" ;;
            armv7l)        echo "linux-arm32-v7a" ;;
            armv6l)        echo "linux-arm32-v6" ;;
            mips)          echo "linux-mips32" ;;
            mipsle)        echo "linux-mips32le" ;;
            mips64)        echo "linux-mips64" ;;
            mips64le)      echo "linux-mips64le" ;;
            *)             echo "linux-64" ;;
        esac
    else
        # sing-box
        case "$m" in
            x86_64)        echo "linux-amd64" ;;
            aarch64|arm64) echo "linux-arm64" ;;
            armv7l)        echo "linux-armv7" ;;
            armv6l)        echo "linux-armv6" ;;
            mips)          echo "linux-mips-softfloat" ;;
            mipsle)        echo "linux-mipsle-softfloat" ;;
            mips64)        echo "linux-mips64" ;;
            mips64le)      echo "linux-mips64le" ;;
            *)             echo "linux-amd64" ;;
        esac
    fi
}

# ── 获取本地版本 ─────────────────────────────────────────────────────
get_local_version() {
    local bin version
    case "$CORE" in
        sing-box)
            bin="$SINGBOX_BIN"
            if [ -x "$bin" ]; then
                version=$("$bin" version 2>/dev/null | grep -oE 'sing-box version [0-9]+\.[0-9]+\.[0-9]+[^ ]*' | awk '{print $3}')
            fi
            ;;
        xray)
            bin="$XRAY_BIN"
            if [ -x "$bin" ]; then
                version=$("$bin" version 2>/dev/null | grep -oE 'Xray [0-9]+\.[0-9]+\.[0-9]+[^ ]*' | awk '{print $2}')
            fi
            ;;
        *)
            printf '{"error":"unknown core: %s"}\n' "$CORE"
            exit 1
            ;;
    esac
    printf '{"core":"%s","version":"%s"}\n' "$CORE" "${version:-unknown}"
}

# ── 获取 GitHub 最新版本号 ────────────────────────────────────────────
get_latest_version() {
    local repo url latest
    case "$CORE" in
        sing-box) repo="SagerNet/sing-box" ;;
        xray)     repo="XTLS/Xray-core" ;;
        *)        printf '{"error":"unknown core"}\n'; exit 1 ;;
    esac
    url="https://api.github.com/repos/${repo}/releases/latest"
    latest=$(curl -sf --max-time 10 "$url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    echo "$latest"
}

# ── 下载并安装最新版 ─────────────────────────────────────────────────
do_update() {
    local arch latest_tag download_url tmp_dir
    arch=$(detect_arch "$CORE")   # 传入 core 名称，映射不同的文件名规则
    log_info "Fetching latest $CORE release..."
    latest_tag=$(get_latest_version)

    if [ -z "$latest_tag" ]; then
        log_error "Failed to fetch latest version for $CORE"
        printf '{"success":false,"error":"fetch latest version failed"}\n'
        exit 1
    fi

    log_info "Latest $CORE version: $latest_tag, arch: $arch"
    tmp_dir=$(mktemp -d)

    case "$CORE" in
        sing-box)
            local version_num
            version_num=$(echo "$latest_tag" | sed 's/^v//')
            download_url="https://github.com/SagerNet/sing-box/releases/download/${latest_tag}/sing-box-${version_num}-${arch}.tar.gz"
            log_info "Downloading $download_url ..."
            if ! curl -sfL --max-time 120 -o "$tmp_dir/sing-box.tar.gz" "$download_url"; then
                rm -rf "$tmp_dir"
                log_error "Download failed"
                printf '{"success":false,"error":"download failed"}\n'
                exit 1
            fi
            # busybox tar 不支持 --wildcards，先全量解压再 find
            tar -xzf "$tmp_dir/sing-box.tar.gz" -C "$tmp_dir" 2>/dev/null
            local extracted
            extracted=$(find "$tmp_dir" -name "sing-box" -not -name "*.tar.gz" -type f | head -1)
            if [ -z "$extracted" ]; then
                rm -rf "$tmp_dir"
                log_error "Binary not found in archive"
                printf '{"success":false,"error":"binary not found in archive"}\n'
                exit 1
            fi
            cp "$extracted" "$SINGBOX_BIN"
            chmod +x "$SINGBOX_BIN"
            ;;
        xray)
            download_url="https://github.com/XTLS/Xray-core/releases/download/${latest_tag}/Xray-${arch}.zip"
            log_info "Downloading $download_url ..."
            if ! curl -sfL --max-time 120 -o "$tmp_dir/xray.zip" "$download_url"; then
                rm -rf "$tmp_dir"
                log_error "Download failed"
                printf '{"success":false,"error":"download failed"}\n'
                exit 1
            fi
            # xray zip 根目录直接包含 xray 二进制；重定向 stdout 避免污染 JSON 输出
            unzip -o "$tmp_dir/xray.zip" xray -d "$tmp_dir" >/dev/null 2>&1
            if [ ! -f "$tmp_dir/xray" ]; then
                rm -rf "$tmp_dir"
                log_error "Binary not found in archive"
                printf '{"success":false,"error":"binary not found in archive"}\n'
                exit 1
            fi
            cp "$tmp_dir/xray" "$XRAY_BIN"
            chmod +x "$XRAY_BIN"
            ;;
    esac

    rm -rf "$tmp_dir"
    log_info "$CORE updated to $latest_tag"
    printf '{"success":true,"version":"%s"}\n' "$latest_tag"
}

# ── 入口 ─────────────────────────────────────────────────────────────
case "$ACTION" in
    version) get_local_version ;;
    update)  do_update ;;
    *)
        echo "Usage: $0 <version|update> <sing-box|xray>" >&2
        exit 1
        ;;
esac
