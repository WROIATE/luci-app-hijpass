package main

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

func protocol(s section) (object, error) {
	co := core(s)
	typ := s.str("type")
	name := s.str("name")
	server := s.str("server")
	p := s.num("server_port")
	tlsName := s.val("tls_server_name", server)
	if co == "xray" {
		o := object{"protocol": typ, "tag": name}
		settings := object{"address": server, "port": p}
		o["settings"] = settings
		switch typ {
		case "shadowsocks":
			fields(settings, s, "", "method", "password")
			settings["level"] = 0
			if s.str("udp_over_tcp") == "1" {
				settings["uot"] = true
			}
		case "hysteria2":
			o["protocol"] = "hysteria"
			settings["version"] = 2
			hy := object{"version": 2, "auth": s.str("password")}
			numbers(hy, s, "", "udp_idle_timeout")
			if v, ok := hy["udp_idle_timeout"]; ok {
				hy["udpIdleTimeout"] = v
				delete(hy, "udp_idle_timeout")
			}
			st := object{"network": "hysteria", "security": "tls", "tlsSettings": object{"serverName": tlsName, "alpn": []string{"h3"}}, "hysteriaSettings": hy}
			q := object{}
			for k, v := range map[string]string{"up_mbps": "brutalUp", "down_mbps": "brutalDown"} {
				if x := strings.TrimSpace(s.str(k)); x != "" {
					if x != "0" {
						x += " mbps"
					}
					q[v] = x
				}
			}
			if len(q) > 0 {
				st["finalmask"] = object{"quicParams": q}
			}
			o["streamSettings"] = st
		case "vless":
			settings["id"] = s.str("uuid")
			settings["encryption"] = "none"
			settings["level"] = 0
			fields(settings, s, "", "flow")
			st := object{"network": "raw", "security": "none"}
			if s.str("tls_reality_enabled") == "1" {
				st["security"] = "reality"
				st["realitySettings"] = object{"fingerprint": "chrome", "serverName": tlsName, "password": s.str("tls_reality_public_key"), "shortId": s.str("tls_reality_short_id")}
			} else if s.str("tls_server_name") != "" {
				st["security"] = "tls"
				st["tlsSettings"] = object{"alpn": []string{"h2", "http/1.1"}, "serverName": tlsName}
			}
			switch t := s.str("transport_type"); t {
			case "xhttp":
				st["network"] = "xhttp"
				st["xhttpSettings"] = object{"host": s.str("transport_xhttp_host"), "path": s.val("transport_xhttp_path", "/"), "mode": s.val("transport_xhttp_mode", "auto")}
			case "http":
				st["network"] = "xhttp"
				st["xhttpSettings"] = object{"host": s.str("transport_http_host"), "path": s.val("transport_http_path", "/"), "mode": "stream-one", "uplinkHTTPMethod": s.str("transport_http_method")}
			case "httpupgrade":
				st["network"] = t
				st["httpupgradeSettings"] = object{"host": s.str("transport_httpupgrade_host"), "path": s.val("transport_httpupgrade_path", "/")}
			case "ws":
				path := s.val("transport_ws_path", "/")
				if ed := strings.TrimSpace(s.str("transport_ws_max_early_data")); ed != "" {
					base, hash, hasHash := strings.Cut(path, "#")
					sep := "?"
					if strings.Contains(base, "?") {
						sep = "&"
					}
					path = base + sep + "ed=" + url.QueryEscape(ed)
					if hasHash {
						path += "#" + hash
					}
				}
				st["network"] = "websocket"
				st["wsSettings"] = object{"host": s.str("transport_ws_host"), "path": path}
			case "grpc":
				g := object{"serviceName": s.val("transport_grpc_service_name", "TunService")}
				for k, v := range map[string]string{"idle_timeout": "idle_timeout", "ping_timeout": "health_check_timeout"} {
					n, e := strconv.Atoi(strings.TrimSuffix(strings.TrimSpace(s.str("transport_grpc_"+k)), "s"))
					if e == nil && n > 0 {
						g[v] = n
					}
				}
				flags(g, s, "transport_grpc_", "permit_without_stream")
				st["network"] = "grpc"
				st["grpcSettings"] = g
			case "":
			default:
				return nil, fmt.Errorf("unsupported Xray transport %q", t)
			}
			o["streamSettings"] = st
		default:
			return nil, fmt.Errorf("unsupported Xray protocol %q", typ)
		}
		return o, nil
	}
	if co != "sing-box" {
		return nil, fmt.Errorf("unsupported core %q", co)
	}
	o := object{"type": typ, "tag": name, "server": server, "server_port": p}
	tls := object{"enabled": true, "server_name": tlsName, "insecure": s.str("tls_insecure") == "1"}
	switch typ {
	case "shadowsocks":
		fields(o, s, "", "method", "password", "network", "plugin", "plugin_opts")
		flags(o, s, "", "udp_over_tcp")
	case "hysteria2":
		fields(o, s, "", "password", "hop_interval", "network")
		numbers(o, s, "", "up_mbps", "down_mbps")
		ranges := s.list("server_ports")
		for i, v := range ranges {
			ranges[i] = strings.Replace(v, "-", ":", 1)
		}
		o["server_ports"] = ranges
		if s.str("obfs_type") == "salamander" && s.str("obfs_password") != "" {
			o["obfs"] = object{"type": "salamander", "password": s.str("obfs_password")}
		}
		o["tls"] = tls
	case "tuic":
		fields(o, s, "", "uuid", "password", "congestion_control", "udp_relay_mode", "heartbeat", "network")
		flags(o, s, "", "udp_over_stream", "zero_rtt_handshake")
		o["tls"] = tls
	case "shadowtls":
		numbers(o, s, "", "version")
		fields(o, s, "", "password")
		o["tls"] = tls
	case "vless":
		fields(o, s, "", "uuid", "flow", "network", "packet_encoding")
		o["tls"] = tls
		if s.str("tls_reality_enabled") == "1" && s.str("tls_reality_public_key") != "" {
			tls["reality"] = object{"enabled": true, "public_key": s.str("tls_reality_public_key"), "short_id": s.str("tls_reality_short_id")}
		}
		t := s.str("transport_type")
		tr := object{"type": t}
		pre := "transport_" + t + "_"
		switch t {
		case "http":
			fields(tr, s, pre, "host", "path", "method", "idle_timeout", "ping_timeout")
		case "ws":
			fields(tr, s, pre, "path", "early_data_header_name")
			numbers(tr, s, pre, "max_early_data")
			if h := s.str(pre + "host"); h != "" {
				tr["headers"] = object{"Host": h}
			}
		case "grpc":
			fields(tr, s, pre, "service_name", "idle_timeout", "ping_timeout")
			flags(tr, s, pre, "permit_without_stream")
		case "httpupgrade":
			fields(tr, s, pre, "host", "path")
		case "":
		default:
			return nil, fmt.Errorf("unsupported sing-box transport %q", t)
		}
		if t != "" {
			o["transport"] = tr
		}
	default:
		return nil, fmt.Errorf("unsupported sing-box protocol %q", typ)
	}
	if (typ == "vless" || typ == "shadowsocks") && s.str("multiplex_enabled") == "1" {
		m := object{"enabled": true}
		fields(m, s, "multiplex_", "protocol")
		numbers(m, s, "multiplex_", "max_connections", "min_streams", "max_streams")
		if s.str("multiplex_brutal_enabled") == "1" {
			b := object{"enabled": true}
			numbers(b, s, "multiplex_brutal_", "up_mbps", "down_mbps")
			m["brutal"] = b
		}
		o["multiplex"] = m
	}
	return o, nil
}
