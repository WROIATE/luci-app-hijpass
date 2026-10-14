
'use strict';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

var LuciView=(()=>{var $=Object.defineProperty;var Gt=Object.getOwnPropertyDescriptor;var zt=Object.getOwnPropertyNames;var Vt=Object.prototype.hasOwnProperty;var Wt=(t,e)=>{for(var n in e)$(t,n,{get:e[n],enumerable:!0})},Kt=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of zt(e))!Vt.call(t,o)&&o!==n&&$(t,o,{get:()=>e[o],enumerable:!(r=Gt(e,o))||r.enumerable});return t};var qt=t=>Kt($({},"__esModule",{value:!0}),t);var Ze={};Wt(Ze,{default:()=>Qe});var u={CUSTOM:"custom",LOAD_BALANCE:"load_balance",HYSTERIA2:"hysteria2",SHADOWSOCKS:"shadowsocks",TUIC:"tuic",SHADOWTLS:"shadowtls",VLESS:"vless"},d={XRAY:"xray",SING_BOX:"sing-box",CUSTOM:"custom"},w={NONE:"none",PRE_ROUTING:"pre-routing",ROUTING:"routing"};function I(t){let e=(t||"").trim();return e==="singbox"?d.SING_BOX:e}var en={[d.XRAY]:[u.SHADOWSOCKS,u.HYSTERIA2,u.VLESS],[d.SING_BOX]:[u.SHADOWSOCKS,u.HYSTERIA2,u.VLESS,u.TUIC,u.SHADOWTLS]},nn={DNS_STRATEGY_VALUES:[{label:"Prefer IPv6 (sing-box only, xray uses dual stack by default)",value:"64"},{label:"Prefer IPv4 (sing-box only, xray uses dual stack by default)",value:"46"},{label:"IPv6 only",value:"6"},{label:"IPv4 only",value:"4"}],SHUNT_LOG_LEVELS:["info","warn","error","debug"],PROXY_LOG_LEVELS:["info","warn","error","debug"],SHUNT_CONF_TYPE:[d.XRAY,d.SING_BOX],PROXY_TYPES:[{label:"Load Balancing",value:"load_balance"},{label:"Shadowsocks",value:"shadowsocks"},{label:"Hysteria2",value:"hysteria2"},{label:"VLESS",value:"vless"},{label:"TUIC",value:"tuic"},{label:"ShadowTLS",value:"shadowtls"}],SHADOWSOCKS_METHODS:[{label:"2022-blake3-aes-128-gcm",value:"2022-blake3-aes-128-gcm"},{label:"2022-blake3-aes-256-gcm",value:"2022-blake3-aes-256-gcm"},{label:"2022-blake3-chacha20-poly1305",value:"2022-blake3-chacha20-poly1305"},{label:"aes-128-gcm",value:"aes-128-gcm"},{label:"aes-192-gcm",value:"aes-192-gcm"},{label:"aes-256-gcm",value:"aes-256-gcm"},{label:"chacha20-ietf-poly1305",value:"chacha20-ietf-poly1305"},{label:"xchacha20-ietf-poly1305",value:"xchacha20-ietf-poly1305"}],MULTIPLEX_PROTOCOLS:[{label:"smux",value:"smux"},{label:"yamux",value:"yamux"},{label:"h2mux",value:"h2mux"}],TUIC_CONGESTION_CONTROLS:[{label:"cubic",value:"cubic"},{label:"new_reno",value:"new_reno"},{label:"bbr",value:"bbr"}],TUIC_UDP_RELAY_MODES:[{label:"Native UDP",value:"native"},{label:"QUIC Stream",value:"quic"}],SHADOWTLS_VERSIONS:[{label:"v1",value:"1"},{label:"v2",value:"2"},{label:"v3",value:"3"}],VLESS_FLOWS:[{label:"None",value:""},{label:"xtls-rprx-vision",value:"xtls-rprx-vision"},{label:"xtls-rprx-vision-udp443",value:"xtls-rprx-vision-udp443"}],VLESS_PACKET_ENCODINGS:[{label:"Disabled",value:""},{label:"packetaddr",value:"packetaddr"},{label:"xudp",value:"xudp"}],V2RAY_TRANSPORT_TYPES_XRAY:[{label:"None",value:""},{label:"HTTP",value:"http"},{label:"WebSocket",value:"ws"},{label:"gRPC",value:"grpc"},{label:"HTTPUpgrade",value:"httpupgrade"},{label:"XHTTP",value:"xhttp"}],HYSTERIA2_OBFS_TYPES:[{label:"Disabled",value:""},{label:"Salamander",value:"salamander"}],DUAL_CORES:[{label:"sing-box",value:d.SING_BOX},{label:"xray",value:d.XRAY},{label:"Custom",value:d.CUSTOM}]};var ut=view;var a=uci;var f=form;var P=ui;var h=fs;var $t={hijpass:{client_dir:"/etc/hijpass/client",shunt_conf:"/etc/hijpass/shunt.json",ip_direct:"/etc/hijpass/rules/ip-direct.txt",ip_proxy:"/etc/hijpass/rules/ip-proxy.txt",domain_direct:"/etc/hijpass/rules/domain-direct.txt",domain_proxy:"/etc/hijpass/rules/domain-proxy.txt",firewall_rules:"/etc/hijpass/firewall",nft_hook:"/etc/hijpass/hook/nft-hook.sh",dns_hook:"/etc/hijpass/hook/dns-hook.sh"},hijserver:{server_dir:"/etc/hijpass/server"}};function Jt(t){let e=(t||"").trim().replace(/\r\n/g,`
`);return e?e+`
`:""}function J(t,e="hijpass"){let n=a.get_first(e,e,t);if(n)return n;let r=$t[e]?.[t];return r||(console.log(t+" path is empty"),"")}function Qt(t,e,n,r){if(!e)throw new Error(_("Configuration file directory is empty"));let i=r?.section?.formvalue?.(n,"name")||a.get(t,n,"name")||n;return e+"/"+i+"-"+n+".json"}function Zt(t){let e=t.name||t[".name"];return J("client_dir")+"/"+e+"-"+t[".name"]+".json"}function te(t){let e=t.name||t[".name"];return J("server_dir","hijserver")+"/"+e+"-"+t[".name"]+".json"}var b={normalizeFileContent:Jt,getFilePath:J,getNodeConfigFilePath:Qt,getProxyConfigFilePath:Zt,getServerConfigFilePath:te};async function ee(t){async function e(n,r,o){let i=o?[n,r,o]:[n,r];await h.exec("/usr/lib/hijpass/maintenance/cleanup.sh",i)}if(t?.hijpass){for(let n of t.hijpass)if(n.length===2&&n[0]==="remove"&&await e("proxy",n[1]),n.length===4&&n[0]==="set"&&n[2]==="name"){let r=a.get("hijpass",n[1]),o=r?b.getProxyConfigFilePath(r):void 0;await e("proxy",n[1],o)}}if(t?.hijserver){for(let n of t.hijserver)if(n.length===2&&n[0]==="remove"&&await e("server",n[1]),n.length===4&&n[0]==="set"&&n[2]==="name"){let r=a.get("hijserver",n[1]),o=r?b.getServerConfigFilePath(r):void 0;await e("server",n[1],o)}}}var ft={cleanupChangedNodeFiles:ee};var Q=class{container=null;notifications=new Map;notificationId=0;autoCloseTimers=new Map;constructor(){this.initContainer()}initContainer(){this.container||(this.container=document.createElement("div"),this.container.id="notification-container",this.container.style.cssText=`
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            pointer-events: none;
        `,document.body.appendChild(this.container))}getTypeConfig(e){let n={success:{bgColor:"#4caf50",borderColor:"#45a049",icon:"\u2713",textColor:"#fff"},error:{bgColor:"#f44336",borderColor:"#da190b",icon:"\u2715",textColor:"#fff"},warning:{bgColor:"#ff9800",borderColor:"#e68900",icon:"\u26A0",textColor:"#fff"},info:{bgColor:"#2196f3",borderColor:"#0b7dda",icon:"\u2139",textColor:"#fff"}};return n[e]||n.info}show(e){let{message:n,title:r,content:o,type:i="info",duration:s=3e3,icon:l=!1}=e;this.initContainer();let c=`notification-${++this.notificationId}`,p=this.getTypeConfig(i),A=r||n,dt=o,S=document.createElement("div");if(S.id=c,S.style.cssText=`
            background-color: ${p.bgColor};
            border-left: 4px solid ${p.borderColor};
            color: ${p.textColor};
            padding: 16px 20px;
            margin-bottom: 10px;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: flex-start;
            gap: 12px;
            min-width: 300px;
            max-width: 400px;
            word-break: break-word;
            animation: slideInRight 0.3s ease-out;
            pointer-events: auto;
            transition: all 0.3s ease;
            font-size: 14px;
            font-weight: 500;
        `,l){let g=document.createElement("span");g.style.cssText=`
                font-size: 20px;
                font-weight: bold;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                margin-top: 2px;
            `,g.textContent=p.icon,S.appendChild(g)}let Y=document.createElement("div");if(Y.style.cssText=`
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `,A){let g=document.createElement("div");g.style.cssText=`
                font-weight: 600;
                font-size: 14px;
                line-height: 1.4;
            `,g.textContent=A,Y.appendChild(g)}if(dt){let g=document.createElement("div");g.style.cssText=`
                font-weight: 400;
                font-size: 13px;
                line-height: 1.4;
                opacity: 0.9;
                white-space: pre-line;
            `,g.textContent=dt,Y.appendChild(g)}S.appendChild(Y);let T=document.createElement("button");if(T.style.cssText=`
            background: none;
            border: none;
            color: ${p.textColor};
            cursor: pointer;
            font-size: 20px;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0.7;
            transition: opacity 0.2s;
        `,T.innerHTML="\xD7",T.onmouseover=()=>T.style.opacity="1",T.onmouseout=()=>T.style.opacity="0.7",T.onclick=g=>{g.stopPropagation(),this.remove(c)},S.appendChild(T),this.container.appendChild(S),this.notifications.set(c,S),s>0){let g=setTimeout(()=>{this.remove(c)},s);this.autoCloseTimers.set(c,g),S.onmouseenter=()=>{let H=this.autoCloseTimers.get(c);H&&(clearTimeout(H),this.autoCloseTimers.delete(c))},S.onmouseleave=()=>{if(this.notifications.has(c)){let H=setTimeout(()=>{this.remove(c)},s);this.autoCloseTimers.set(c,H)}}}return c}remove(e){let n=this.notifications.get(e);if(!n)return;let r=this.autoCloseTimers.get(e);r&&(clearTimeout(r),this.autoCloseTimers.delete(e)),n.style.animation="slideOutRight 0.3s ease-in",n.style.opacity="0",setTimeout(()=>{n.remove(),this.notifications.delete(e)},300)}success(e,n){return this.show({message:e,type:"success",duration:n})}error(e,n){return this.show({message:e,type:"error",duration:n})}warning(e,n){return this.show({message:e,type:"warning",duration:n})}info(e,n){return this.show({message:e,type:"info",duration:n})}clear(){this.notifications.forEach((e,n)=>{this.remove(n)})}},ne=new Q;function gt(){if(document.getElementById("notification-styles"))return;let t=document.createElement("style");t.id="notification-styles",t.textContent=`
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }

        @media (max-width: 768px) {
            #notification-container {
                left: 10px !important;
                right: 10px !important;
                top: 10px !important;
            }

            #notification-container > div {
                min-width: auto !important;
                max-width: 100% !important;
            }
        }
    `,document.head.appendChild(t)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",gt):gt();var R=ne;var M={show:function(t){return R.show(t)},success:function(t,e,n){return R.show({title:t,content:e,type:"success",duration:n})},error:function(t,e,n){return R.show({title:t,content:e,type:"error",duration:n})},warning:function(t,e,n){return R.show({title:t,content:e,type:"warning",duration:n})},info:function(t,e,n){return R.show({title:t,content:e,type:"info",duration:n})},clear:function(){return R.clear()}};var k=rpc;var _t=k.declare({object:"hijpass-config",method:"render",params:["sections","target"],expect:{"":{}}}),re=k.declare({object:"hijpass-config",method:"validate",params:["sections"],expect:{"":{}}});function Z(){return JSON.stringify(a.sections("hijpass",void 0))}async function oe(t){let e=await _t(Z(),t);if(e.error)throw new Error(e.error);return e.config}var ht={preview:oe,render:async function(){let t=await _t(Z(),"");if(t.error)throw new Error(t.error);return t},validate:async function(){let t=await re(Z());if(t.error)throw new Error(t.error);if(!t.ok)throw new Error(_("Configuration validation failed"))}};var D={setAnonymousGridSectionMembers:function(t){D.setGridSectionMembers(t),t.anonymous=!0,t.sectiontitle=function(e){return a.get("hijpass",e,"name")||a.get("hijpass",e,"tag")||e}},setGridSectionMembers:function(t){t.anonymous=!1,t.addremove=!0,t.sortable=!0,t.nodescriptions=!0,t.rowcolors=!0},setAnonymousSection:function(t){t.anonymous=!0,t.addremove=!1},simpleHash:function(t){let e=0;t=t||"";for(let n=0;n<t.length;n++)e=(e<<5)-e+t.charCodeAt(n),e|=0;return e},setEditorOptionMembers:function(t,e,n){t.rows=30,t.load=function(o){return h.trimmed(e)};async function r(o,i){let s=String(D.simpleHash(i)),l=a.get("hijpass",o,n);s!==l&&(a.set("hijpass",o,n,s),await h.write(e,(i||"").trim().replace(/\r\n/g,`
`)+`
`))}return t.write=r,t.remove=r,t.monospace=!0,t},setConfContentOptionMembers:function(t,e,n){t.monospace=!0,t.rows=20,t.load=async function(r){return L.resolveDefault(h.read(b.getNodeConfigFilePath(e,n,r)),"")},t.write=async function(r,o){let i=b.normalizeFileContent(o);await h.write(b.getNodeConfigFilePath(e,n,r,this),i),a.set(e,r,"custom_conf_hash",String(D.simpleHash(i)))},t.remove=async function(r){await h.write(b.getNodeConfigFilePath(e,n,r,this),""),a.set(e,r,"custom_conf_hash","")}},createTextOption:function(t,e,n,r,o,i){let s=t.taboption(e,f.TextValue,n,r,o);return D.setEditorOptionMembers(s,i,n),s},createLogFlagOption:function(t,e,n){let r=a.get_first(e,e,"log_dir"),o=n?t.taboption(n,f.Flag,"log_enabled",_("Record Logs")):t.option(f.Flag,"log_enabled",_("Record Logs"));return o.modalonly=!0,o.write=function(i,s){let l="shunt.log",c=a.get(e,i,"name");c&&(l=c+"-"+i+".log"),a.set(e,i,"log_path",r+"/"+l)},o.remove=function(i){a.unset(e,i,"log_path")},o.load=function(i){return a.get(e,i,"log_path")?"1":"0"},o.rmempty=!0,o},appendEnabledNodeListenPorts:function(t){a.sections("hijpass","proxy_node",e=>{if(e.listen_port&&e.enabled==="1"){let n=_("Proxy node %s: %s").format(e.name,e.listen_port);t.value(e.listen_port,n)}})},loadProxyNodeOptions:function(t,e=!0){t.load=function(n){return delete this.keylist,delete this.vallist,this.value("hijpass-direct",_("Direct")),e&&this.value("hijpass-block",_("Block")),a.sections("hijpass","proxy_node",function(r){if(r.name&&r.enabled==="1"){let o=r.name;r.socks_port&&(o+=" ("+r.socks_port+")"),this.value(r.name,o)}}.bind(this)),f.ListValue.prototype.load.apply(this,[n])}},getEnabledProxyNodeOptions:function(t=!0){let e=[];return t&&(e.push({value:"hijpass-direct",label:_("Direct")}),e.push({value:"hijpass-block",label:_("Block")})),a.sections("hijpass","proxy_node",n=>{if(n.name&&n.enabled==="1"){let r=n.name;n.socks_port&&(r+=" ("+n.socks_port+")"),e.push({value:n.name,label:r})}}),e}};async function se(t,e){let n=t.server;if(t.upstream_proxy_node&&n&&!/^(\d{1,3}\.){3}\d{1,3}$/.test(n)&&!/^[0-9a-fA-F:]+$/.test(n)){let r=await h.exec_direct("/usr/lib/hijpass/network/network.sh",["resolve",n],"json");if(!r?.address)throw new Error(_("Resolve proxy server failed: %s").format(n));let o=e.outbounds?.[0];if(o?.server)o.server=r.address;else if(o?.settings?.address)o.settings.address=r.address;else throw new Error(_("Unsupported proxy config server field: %s").format(t.name||n))}return{path:b.getProxyConfigFilePath(t),data:JSON.stringify(e,null,2)}}async function ae(t){let e=[],n=a.sections("hijpass","proxy_node");for(let o of n){if(!Object.prototype.hasOwnProperty.call(t.nodes,o[".name"]))continue;let i=t.nodes[o[".name"]];i&&e.push(await se(o,i))}let r;t.shunt&&(r=JSON.stringify(t.shunt,null,2),e.push({path:b.getFilePath("shunt_conf"),data:r}));for(let o of e)await h.write(o.path,o.data);r!==void 0&&a.set_first("hijpass","shunt","shunt_hash",String(D.simpleHash(r)))}var mt={writeGeneratedConfigs:ae};var B=class{tag;type;server;port},X=class{defaultDnsNode;defaultStrategy;rulesetDnsNode;useCache;nodes;constructor(){this.nodes=[]}},j=class{enabled;name;proxyNode;ipVersionSplit;proxyNodeV4;proxyNodeV6;protocol;network;port;portRange;domainList;ipList;dnsNode;dnsProxyNode;dnsStrategy;constructor(){this.port=[],this.portRange=[],this.network=[],this.protocol=[],this.ipVersionSplit="0"}},G=class{defaultProxyNode;rulesetOutNode;rulesetConvert;rules;constructor(){this.rules=[]}},z=class{type;configType;shuntListenPort;dnsListenPort;logLevel;logPath;route;dns},V=class{domain;domainRegex;domainKeyword;domainSuffix;ipCidr;network;protocol;port;portRange;ipVersion;ruleSet;geoIp;geoSite;constructor(){this.domain=[],this.domainRegex=[],this.domainKeyword=[],this.domainSuffix=[],this.ruleSet=[],this.ipCidr=[],this.geoIp=[],this.geoSite=[],this.network=[],this.protocol=[],this.port=[],this.portRange=[]}containDomain(){return this.domain.length>0||this.domainRegex.length>0||this.domainSuffix.length>0||this.domainKeyword.length>0}containGeo(){return this.geoSite.length>0||this.geoIp.length>0}containRuleSet(){return this.ruleSet.length>0}containIp(){return this.ipCidr.length>0||this.geoIp.length>0}isEmpty(e){return!(this.containDomain()||this.containIp()||e==="geo"&&this.containGeo()||e==="set"&&this.containRuleSet()||this.network.length>0||this.port.length>0||this.portRange.length>0||this.protocol.length>0)}};var F={camelToSnake:function(t){return t.replace(/([A-Z])/g,function(e){return"_"+e.toLowerCase()})},transFromUci:function(t,e){Object.keys(t).forEach(n=>{let r=F.camelToSnake(n);e[r]&&(t[n]=e[r])})},generateUniqueSectionId:function(t="hijpass"){let e="abcdefghijklmnopqrstuvwxyz0123456789",n="";for(;;){n="";for(let r=0;r<8;r++)n+=e.charAt(Math.floor(Math.random()*e.length));if(!a.get(t,n))break}return n}};function yt(t,e){let n=t.substring(e==="remote"?16:15),r=n.split("/").pop(),o=r.substring(0,r.lastIndexOf("."))||r,i=(e==="remote"?n:r).endsWith("srs")?"binary":"source";return{tag:o,type:e,format:i,pathOrUrl:n}}var N={getShuntSection:function(){let t=new z,e=a.get_first("hijpass","shunt");return F.transFromUci(t,e),t.dns=N.getDnsSection(),t.route=N.getRouteSection(),t},getRouteSection:function(){let t=a.get_first("hijpass","shunt"),e=new G;return F.transFromUci(e,t),a.sections("hijpass","shunt_route_rule",function(n){let r=new j;F.transFromUci(r,n),e.rules.push(r)}),e},getRouteRuleVariants:function(t){if(t.ipVersionSplit!=="1")return[{rule:t,proxyNode:t.proxyNode}];let e=[];if(t.proxyNodeV4){let n=Object.assign(new j,t);n.name=t.name?t.name+"-ipv4":t.name,n.proxyNode=t.proxyNodeV4,e.push({rule:n,proxyNode:t.proxyNodeV4,ipVersion:4})}if(t.proxyNodeV6){let n=Object.assign(new j,t);n.name=t.name?t.name+"-ipv6":t.name,n.proxyNode=t.proxyNodeV6,e.push({rule:n,proxyNode:t.proxyNodeV6,ipVersion:6})}return e},getDnsSection:function(){let t=a.get_first("hijpass","shunt"),e=new X;return e.nodes=[],F.transFromUci(e,t),a.sections("hijpass","shunt_dns_node",function(n){if(n.enabled==="0")return;let r=new B;F.transFromUci(r,n),e.nodes.push(r)}),e},parseRuleList:function(t){let e=new V,n=t.domainList,r=t.ipList;if(e.network=t.network?t.network:[],e.protocol=t.protocol?t.protocol:[],t.port&&(e.port=t.port.map(o=>parseInt(o,10)).filter(o=>!isNaN(o))),t.portRange&&(e.portRange=t.portRange.map(o=>o.replace("-",":")).filter(o=>o.length>0)),n&&n.trim()!==""){let o=n.split(`
`);for(let i of o)if(i=i.trim(),!(i===""||i.startsWith("#"))){if(i.startsWith("rule-set:")){let s=i.startsWith("rule-set:remote:")?"remote":"local",l=yt(i,s);e.ruleSet.push(l);continue}i.startsWith("regexp:")?e.domainRegex.push(i.substring(7)):i.startsWith("domain:")?e.domainSuffix.push(i.substring(7)):i.startsWith("full:")?e.domain.push(i.substring(5)):i.startsWith("geosite:")?e.geoSite.push(i):e.domainKeyword.push(i)}}if(r&&r.trim()!==""){let o=r.split(`
`);for(let i of o)if(i=i.trim(),!(i===""||i.startsWith("#"))){if(i.startsWith("rule-set:")){let s=i.startsWith("rule-set:remote:")?"remote":"local",l=yt(i,s);e.ruleSet.push(l);continue}i.startsWith("geoip:")?e.geoIp.push(i):e.ipCidr.push(i)}}return e}};function le(){let t=a.get_first("hijpass","shunt","type");if(t!=="sing-box"&&t!=="singbox"||a.get_first("hijpass","shunt","enabled")==="0"||a.get_first("hijpass","shunt","ruleset_convert")!=="1")return;let e=new Set,n=new Set;for(let r of N.getRouteSection().rules){if(r.enabled!=="1")continue;let o=N.parseRuleList(r);for(let i of o.geoSite)e.add(i.replace("geosite:",""));for(let i of o.geoIp)n.add(i.replace("geoip:",""))}for(let[r,o]of[["geosite_ruleset",[...e]],["geoip_ruleset",[...n]]]){let i=a.get_first("hijpass","shunt",r)??[];JSON.stringify(i)!==JSON.stringify(o)&&a.set_first("hijpass","shunt",r,o.length?o:void 0)}}var xt={updateGeoRules:le};var tt=3,ce="lb-member-";function wt(t){return t?.name||t?.[".name"]||""}function et(t){return I(t?.core||d.SING_BOX)}function nt(t){if(!t)return!1;let e=Number(t);return Number.isInteger(e)&&e>0&&e<=65535}function bt(){let t=[];return a.sections("hijpass","proxy_node",function(e){t.push(e)}),t}function rt(){let t=new Map;return bt().forEach(e=>{let n=wt(e);n&&t.set(n,e)}),t}function Nt(t){return"upstream-"+t}function ot(t){return t?(Array.isArray(t)?t:[t]).filter(e=>!!e):[]}function Et(t){return ce+t}function pe(t,e=rt()){let n=ot(t.member_node);if(n.length===0)throw new Error("Load balancing node has no members: "+t.name);return n.map((r,o)=>{if(r===t.name)throw new Error("Load balancing node cannot include itself: "+r);let i=e.get(r);if(!i)throw new Error("Load balancing member node not found: "+r);if(i.type===u.LOAD_BALANCE)throw new Error("Nested load balancing members are not supported: "+r);if(i.enabled!=="1")throw new Error("Load balancing member node disabled: "+r);if(!nt(i.socks_port))throw new Error("Load balancing member node SOCKS port invalid: "+r);return{name:r,socksPort:Number(i.socks_port),tag:Et(o),core:et(i),section:i}})}function de(t,e=rt()){let n=t.upstream_proxy_node;if(!n)return;if(n===t.name)throw new Error("Upstream proxy node cannot be itself: "+n);let r=e.get(n);if(!r)throw new Error("Upstream proxy node not found: "+n);if(r.enabled!=="1")throw new Error("Upstream proxy node disabled: "+n);if(!nt(r.socks_port))throw new Error("Upstream proxy node SOCKS port invalid: "+n);return{name:n,socksPort:Number(r.socks_port),tag:Nt(n),core:et(r),section:r}}function ue(t,e){let n=[],r=new Set,o=t;for(;o;){if(r.has(o))return n.push(o),{chain:n,cycle:!0};r.add(o),n.push(o);let i=e.get(o);if(!i||!i.upstream_proxy_node)break;o=i.upstream_proxy_node}return{chain:n,cycle:!1}}function vt(t){let e=[];return t?.type===u.LOAD_BALANCE?e.push(...ot(t.member_node)):t?.upstream_proxy_node&&e.push(t.upstream_proxy_node),e}function fe(t){let e=new Set,n=new Set,r=[];function o(i){if(n.has(i)){let l=r.indexOf(i);return r.slice(l).concat(i)}if(e.has(i))return;let s=t.get(i);if(!(!s||s.enabled!=="1")){n.add(i),r.push(i);for(let l of vt(s)){let c=o(l);if(c)return c}r.pop(),n.delete(i),e.add(i)}}for(let i of t.keys()){let s=o(i);if(s)return s}}var m={getProxyName:wt,getProxyCore:et,getProxySections:bt,getProxySectionMap:rt,isPort:nt,getUpstreamProxyOutboundTag:Nt,normalizeProxyNodeList:ot,getLoadBalanceMemberOutboundTag:Et,resolveUpstreamProxy:de,resolveLoadBalanceMembers:pe,collectProxyChain:ue,getProxyDependencies:vt,findProxyDependencyCycle:fe};function Ct(t){let e=Number(t);return Number.isInteger(e)&&e>0&&e<=65535}function St(){let t=a.get_first("hijpass","dns"),e=t?.cdg_port||"";return{available:t?.dns_service==="chinadns-ng"&&Ct(e),port:e}}function Tt(){let t=a.get_first("hijpass","shunt"),e=t?.dns_listen_port||"";return{available:t?.enabled!=="0"&&Ct(e),port:e}}function ge(t,e){let n=t;return e.port&&(n+=": "+e.port),e.available||(n+=" - "+_("Not available")),n}var U={getSource:function(){return a.get_first("hijpass","firewall","dns_forward")||w.NONE},getPreRoutingTarget:St,getRoutingTarget:Tt,getTargetLabel:ge,validateSource:function(t){return!t||t===w.NONE?!0:t===w.PRE_ROUTING?St().available?!0:_("Independent DNS is unavailable or has no valid listen port"):t===w.ROUTING?Tt().available?!0:_("Core DNS is disabled or has no valid listen port"):_("Unknown DNS forwarding source: %s").format(t)}};var Ot=["http","tls","quic","bittorrent"],_e=["hysteria2","vless"];function he(t){return t?Array.isArray(t)?t.filter(e=>e):[t]:[]}function me(t){return t==="hijpass-direct"||t==="hijpass-block"}function x(t,e){return e.length===0?!0:(M.warning(t,e.join(`
`),8e3),!1)}function ye(){return a.get_first("hijpass","shunt","enabled")!=="0"&&a.get_first("hijpass","shunt","config_type")==="tmpl"}function xe(){let t=new Set;a.sections("hijpass","proxy_node",function(i){i.name&&t.add(i.name)});let e=[];function n(i,s){i&&!me(i)&&!t.has(i)&&e.push(s)}let r=a.get_first("hijpass","shunt","default_proxy_node");r?n(r,_('Default global exit "%s" does not exist').format(r)):e.push(_("Default global exit is not configured"));let o=a.get_first("hijpass","shunt","ruleset_out_node");return n(o,_('Rule-set exit "%s" does not exist').format(o)),a.sections("hijpass","shunt_route_rule",function(i){if(i.enabled!=="1")return;let s=i.name||i[".name"];if(i.ip_version_split==="1"){i.proxy_node_v4?n(i.proxy_node_v4,_('Route rule "%s" IPv4 proxy node "%s" does not exist').format(s,i.proxy_node_v4)):e.push(_('Route rule "%s" IPv4 proxy node is not configured').format(s)),i.proxy_node_v6?n(i.proxy_node_v6,_('Route rule "%s" IPv6 proxy node "%s" does not exist').format(s,i.proxy_node_v6)):e.push(_('Route rule "%s" IPv6 proxy node is not configured').format(s));return}i.proxy_node?n(i.proxy_node,_('Route rule "%s" proxy node "%s" does not exist').format(s,i.proxy_node)):e.push(_('Route rule "%s" proxy node is not configured').format(s))}),x(_("Configuration contains missing proxy nodes"),e)}function we(){let t=new Set;if(a.sections("hijpass","proxy_node",function(o){o.enabled!=="1"&&o.name&&t.add(o.name)}),t.size===0)return!0;let e=[],n=a.get_first("hijpass","shunt","default_proxy_node");n&&t.has(n)&&e.push(_('Default global exit "%s" is not enabled').format(n));let r=a.get_first("hijpass","shunt","ruleset_out_node");return r&&t.has(r)&&e.push(_('Rule-set exit "%s" is not enabled').format(r)),a.sections("hijpass","shunt_route_rule",function(o){if(o.enabled!=="1")return;let i=o.name||o[".name"];o.ip_version_split==="1"?(o.proxy_node_v4&&t.has(o.proxy_node_v4)&&e.push(_('Route rule "%s" IPv4 proxy node "%s" is not enabled').format(i,o.proxy_node_v4)),o.proxy_node_v6&&t.has(o.proxy_node_v6)&&e.push(_('Route rule "%s" IPv6 proxy node "%s" is not enabled').format(i,o.proxy_node_v6))):o.proxy_node&&t.has(o.proxy_node)&&e.push(_('Route rule "%s" proxy node "%s" is not enabled').format(i,o.proxy_node)),o.dns_proxy_node&&t.has(o.dns_proxy_node)&&e.push(_('Route rule "%s" DNS exit node "%s" is not enabled').format(i,o.dns_proxy_node))}),x(_("Configuration contains disabled nodes"),e)}function be(){let t=m.getProxySectionMap(),e=[];return t.forEach(n=>{if(n.enabled!=="1"||n.type!==u.LOAD_BALANCE)return;let r=m.getProxyName(n),o=I(n.core);o!==d.SING_BOX&&o!==d.XRAY&&e.push(_('Load balancing node "%s" has an unsupported backend core').format(r));let i=m.normalizeProxyNodeList(n.member_node);if(i.length===0){e.push(_('Load balancing node "%s" has no member nodes').format(r));return}let s=i.filter((l,c)=>i.indexOf(l)!==c);s.length>0&&e.push(_('Load balancing node "%s" contains duplicate member nodes: %s').format(r,Array.from(new Set(s)).join(", "))),i.forEach(l=>{if(l===r){e.push(_('Load balancing node "%s" cannot include itself').format(r));return}let c=t.get(l);if(!c){e.push(_('Load balancing node "%s" member node "%s" does not exist').format(r,l));return}c.type===u.LOAD_BALANCE&&e.push(_('Load balancing node "%s" cannot contain load balancing member "%s"').format(r,l)),c.enabled!=="1"&&e.push(_('Load balancing node "%s" member node "%s" is not enabled').format(r,l)),m.isPort(c.socks_port)||e.push(_('Load balancing node "%s" member node "%s" has no valid SOCKS port configured').format(r,l))}),n.fallback_tag&&i.indexOf(n.fallback_tag)<0&&e.push(_('Load balancing node "%s" fallback node "%s" is not a member').format(r,n.fallback_tag))}),x(_("Configuration contains invalid load balancing nodes"),e)}function Ne(){let t=m.getProxySectionMap(),e=[];t.forEach(r=>{if(r.enabled!=="1"||r.type===u.LOAD_BALANCE||!r.upstream_proxy_node)return;let o=m.getProxyName(r),i=r.upstream_proxy_node,s=t.get(i);if(!s){e.push(_('Proxy node "%s" upstream proxy node "%s" does not exist').format(o,i));return}s.enabled!=="1"&&e.push(_('Proxy node "%s" upstream proxy node "%s" is not enabled').format(o,i)),m.isPort(s.socks_port)||e.push(_('Proxy node "%s" upstream proxy node "%s" has no valid SOCKS port configured').format(o,i));let l=m.collectProxyChain(o,t);!l.cycle&&l.chain.length>tt&&e.push(_('Proxy node "%s" nesting chain exceeds %d nodes: %s').format(o,tt,l.chain.join(" -> ")))});let n=m.findProxyDependencyCycle(t);return n&&e.push(_("Proxy node dependency chain has a cycle: %s").format(n.join(" -> "))),x(_("Configuration contains invalid upstream proxy nodes"),e)}function Ee(){let t=new Set,e=new Set;a.sections("hijpass","shunt_dns_node",function(s){s.tag&&(t.add(s.tag),s.enabled==="0"&&e.add(s.tag))});let n=[],r=[];function o(s,l){if(s){if(!t.has(s)){n.push(_('%s "%s" does not exist').format(l,s));return}e.has(s)&&r.push(_('%s "%s" is not enabled').format(l,s))}}let i=a.get_first("hijpass","shunt","default_dns_node");return i?o(i,_("Default global DNS")):n.push(_("Default global DNS is not configured")),o(a.get_first("hijpass","shunt","ruleset_dns_node"),_("Rule-set DNS")),a.sections("hijpass","shunt_route_rule",function(s){s.enabled==="1"&&o(s.dns_node,_('Route rule "%s" DNS node').format(s.name||s[".name"]))}),x(_("Configuration contains missing DNS nodes"),n)&&x(_("Configuration contains disabled DNS nodes"),r)}function ve(){let t=new Set;a.sections("hijpass","proxy_node",function(o){o.name&&t.add(o.name)});let e=a.get_first("hijpass","shunt","type"),n=a.get_first("hijpass","shunt","ruleset_convert"),r=[];return N.getRouteSection().rules.forEach(function(o){if(o.enabled!=="1")return;let i=o.dnsProxyNode,s=o.name||_("Unnamed Rule");if(Se(o,e,n)&&!i){r.push(_('Route rule "%s" uses IPv4/IPv6 split and must specify a DNS exit node').format(s));return}i&&i!=="hijpass-direct"&&!t.has(i)&&r.push(_('Route rule "%s" DNS exit node "%s" does not exist').format(s,i))}),x(_("Configuration contains invalid DNS exit nodes"),r)}function Se(t,e,n){if(t.ipVersionSplit!=="1")return!1;let r=N.parseRuleList(t);return e===d.XRAY?r.containDomain()||r.geoSite.length>0:r.containDomain()||r.containRuleSet()||n==="1"&&r.geoSite.length>0}function Te(){let t=new Set;a.sections("hijpass","proxy_node",function(s){s.enabled==="1"&&s.listen_port&&t.add(s.listen_port)});let e=a.get_first("hijpass","firewall","proxy_port"),n=a.get_first("hijpass","firewall","shunt_port"),r=a.get_first("hijpass","shunt","enabled")!=="0",o=a.get_first("hijpass","shunt","shunt_listen_port"),i=[];return e&&!t.has(e)&&i.push(_("Firewall proxy port %s does not reference an enabled proxy node").format(e)),n&&!t.has(n)&&!(r&&o===n)&&i.push(_("Firewall shunt port %s does not reference an enabled proxy node or shunt service").format(n)),x(_("Configuration conflict"),i)}function Ce(){let t=U.validateSource(U.getSource());return t===!0||x(_("Configuration conflict"),[t])}function Oe(){if(a.get_first("hijpass","dns","dns_service")!=="chinadns-ng")return!0;let e=U.getRoutingTarget(),n=e.port?"127.0.0.1#"+e.port:"",r=[];return[["direct_dns",_("Direct Domain DNS")],["proxy_dns",_("Proxy Domain DNS")]].forEach(([o,i])=>{let s=a.get_first("hijpass","dns",o);!s||s==="dnsmasq"||s==="system"||s==="custom"||(!e.available||s!==n)&&r.push(_("%s references an unavailable Core DNS port").format(i))}),x(_("Configuration conflict"),r)}function Pe(){if(a.get_first("hijpass","shunt","type")!==d.XRAY)return!0;let e=[];return a.sections("hijpass","shunt_route_rule",function(n){if(n.enabled!=="1")return;let r=he(n.protocol).filter(o=>Ot.indexOf(o)===-1);r.length>0&&e.push(_('Route rule "%s" contains protocols unsupported by Xray: %s').format(n.name||n[".name"],r.join(", ")))}),e.length>0?(M.warning(_("Unsupported Xray protocol configuration"),e.join(`
`)+`
`+_("Xray route protocol only supports: %s").format(Ot.join(", ")),8e3),!1):!0}function Re(){if(a.get_first("hijpass","shunt","type")!==d.XRAY)return!0;let e=[];return a.sections("hijpass","shunt_dns_node",function(n){n.enabled!=="0"&&n.type==="tls"&&e.push(_('DNS node "%s" uses TLS, which is only supported by sing-box').format(n.tag||n[".name"]))}),x(_("Unsupported Xray DNS configuration"),e)}function Fe(){let t=[];return a.sections("hijpass","proxy_node",function(e){e.enabled!=="1"||I(e.core)!==d.XRAY||e.tls_insecure!=="1"||_e.indexOf(e.type)!==-1&&t.push(_('Proxy node "%s" enables insecure TLS, which is not supported by current Xray').format(e.name||e[".name"]))}),x(_("Unsupported Xray TLS configuration"),t)}function Ae(t,e,n){return new Promise(r=>{P.showModal(t,[E("div",{style:["box-sizing:border-box","width:100%","margin:0 0 14px 0","padding:14px 16px","border-radius:4px","background:rgba(127,127,127,0.08)","line-height:1.55"].join(";")},[E("div",{style:"margin:0 0 12px 0"},e),E("div",{style:"display:flex;flex-direction:column;gap:6px;margin:0"},n.map(o=>E("div",{style:"margin:0;word-break:break-word"},o)))]),E("div",{style:"display:flex;justify-content:flex-end;gap:10px;margin:0"},[E("button",{class:"btn cbi-button",click:function(o){o.preventDefault(),P.hideModal(),r(!1)}},_("Cancel")),E("button",{class:"btn cbi-button-action",click:function(o){o.preventDefault(),P.hideModal(),r(!0)}},_("Continue Apply"))])])})}function De(t,e,n){let r=N.parseRuleList(t),o=t.name||t[".name"]||_("Unnamed Rule"),i=n==="1";if(e===d.XRAY)return r.isEmpty("geo")?_('Route rule "%s" has no valid match conditions for Xray').format(o):r.containRuleSet()&&!r.containDomain()&&!r.containIp()&&!r.containGeo()?_('Route rule "%s" only contains rule-set target conditions unsupported by Xray').format(o):null;if(e===d.SING_BOX){if(!i&&r.containGeo()&&(r.geoSite=[],r.geoIp=[],!r.containDomain()&&!r.containIp()&&!r.containRuleSet()))return _('Route rule "%s" has no target conditions for sing-box after removing unconverted geosite/geoip').format(o);if(r.isEmpty("set")&&!(i&&r.containGeo()))return _('Route rule "%s" has no valid match conditions for sing-box').format(o)}return null}function Le(){let t=a.get_first("hijpass","shunt","type"),e=a.get_first("hijpass","shunt","ruleset_convert"),n=[];return N.getRouteSection().rules.forEach(r=>{if(r.enabled!=="1")return;let o=De(r,t,e);o&&n.push(o)}),n.length>0?Ae(_("Some route rules will be skipped"),_("The following rules have no valid configuration for the current core and options, so they will not be written to the final configuration. Continue applying the configuration?"),n):!0}var Pt={runSaveApplyPrechecks:async function(){return!Ne()||!be()||!Fe()||!Te()||!Ce()||!Oe()?!1:ye()?xe()&&we()&&Ee()&&ve()&&await Le()&&Pe()&&Re():!0}};function je(){return a.get_first("hijpass","hijpass","enabled")==="0"}var Rt={genHandleSaveApply:function(){return async function(t,e){try{if(await this.handleSave(t),je()){await a.save(),await P.changes.apply(e=="0");return}if(!await Pt.runSaveApplyPrechecks())return;let n=await ht.render();await mt.writeGeneratedConfigs(n),xt.updateGeoRules(),await a.save();let r=await a.changes();await ft.cleanupChangedNodeFiles(r),await P.changes.apply(e=="0")}catch(n){console.log(n),M.error(_("Configuration Apply Failed"),_(n.message),5e3)}}}};var Ft=poll;var it=k.declare({object:"service",method:"list",params:["name"],expect:{"":{}}}),st={};function Dt(t){return t||"all"}function At(t){return"service_status_"+Dt(t)}var v={getServiceInstances:async function(t){return(await it(t))?.[t]?.instances??{}},getServiceInfo:async function(){let t=await it("hijpass"),n=(await it("hijserver"))?.hijserver?.instances??{},r=t?.hijpass?.instances??{};return{proxyInfos:v.getInstanceName("hijpass","proxy_node").map(o=>r?.[o]??void 0).filter(o=>o),shuntInfo:r?.[v.getInstanceName("hijpass","shunt")[0]]??void 0,dnsInfo:r?.[v.getInstanceName("hijpass","dns")[0]]??void 0,serverInfos:v.getInstanceName("hijserver","server_node").map(o=>n?.[o]??void 0).filter(o=>o)}},getInstanceName:function(t,e){return a.sections(t,e).map(n=>{let r=n[".name"],o=n.name??n.tag??n.dns_service;return o||(o=e),r+"-"+o})},renderServiceStatusText:function(t,e){let n="",r='<em><span style="color:%s"><strong>%s %s</strong></span></em>',o=(t?.proxyInfos??[]).filter(p=>p?.running).length>0,i=(t?.serverInfos??[]).filter(p=>p?.running).length>0,s=t?.shuntInfo?.running??!1,l=t?.dnsInfo?.running??!1,c=function(p,A){return A?r.format("green",p,_("Running")):r.format("red",p,_("Not Running"))};switch(e){case"dns":n+=c(_("Independent DNS"),l);break;case"shunt":n+=c(_("Proxy Routing"),s);break;case"server":n+=c(_("Local Server"),i);break;case"proxy":n+=c(_("Proxy Node"),o);break;default:n+=c(_("Proxy Node"),o),n+=c(_("Proxy Routing"),s),n+=c(_("Independent DNS"),l),n+=c(_("Local Server"),i)}return n},refreshServiceStatus:function(t){let e=Dt(t);if(!st[e]){let n=At(t);st[e]=async function(){let r=await L.resolveDefault(v.getServiceInfo()),o=document.getElementById(n);o&&(o.innerHTML=v.renderServiceStatusText(r,t))}}return st[e]},renderServiceStatus:function(t){return function(){let e=v.refreshServiceStatus(t);return Ft.add(e),window.setTimeout(e,0),E("div",{class:"hijpass-service-status"},E("fieldset",{class:"cbi-section"},[E("p",{id:At(t),style:"display: flex; gap: 1rem;"},_("Fetching Status..."))]))}},createStatusSection:function(t,e){let n=t.section(f.TypedSection);return n.anonymous=!0,n.render=v.renderServiceStatus(e),n}};var Ue=[{id:"baidu",name:"Baidu",url:"https://www.baidu.com",svg:'<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Baidu</title><path d="M8.859 11.735c1.017-1.71 4.059-3.083 6.202.286 1.579 2.284 4.284 4.397 4.284 4.397s2.027 1.601.73 4.684c-1.24 2.956-5.64 1.607-6.005 1.49l-.024-.009s-1.746-.568-3.776-.112c-2.026.458-3.773.286-3.773.286l-.045-.001c-.328-.01-2.38-.187-3.001-2.968-.675-3.028 2.365-4.687 2.592-4.968.226-.288 1.802-1.37 2.816-3.085zm.986 1.738v2.032h-1.64s-1.64.138-2.213 2.014c-.2 1.252.177 1.99.242 2.148.067.157.596 1.073 1.927 1.342h3.078v-7.514l-1.394-.022zm3.588 2.191l-1.44.024v3.956s.064.985 1.44 1.344h3.541v-5.3h-1.528v3.979h-1.46s-.466-.068-.553-.447v-3.556zM9.82 16.715v3.06H8.58s-.863-.045-1.126-1.049c-.136-.445.02-.959.088-1.16.063-.203.353-.671.951-.85H9.82zm9.525-9.036c2.086 0 2.646 2.06 2.646 2.742 0 .688.284 3.597-2.309 3.655-2.595.057-2.704-1.77-2.704-3.08 0-1.374.277-3.317 2.367-3.317zM4.24 6.08c1.523-.135 2.645 1.55 2.762 2.513.07.625.393 3.486-1.975 4-2.364.515-3.244-2.249-2.984-3.544 0 0 .28-2.797 2.197-2.969zm8.847-1.483c.14-1.31 1.69-3.316 2.931-3.028 1.236.285 2.367 1.944 2.137 3.37-.224 1.428-1.345 3.313-3.095 3.082-1.748-.226-2.143-1.823-1.973-3.424zM9.425 1c1.307 0 2.364 1.519 2.364 3.398 0 1.879-1.057 3.4-2.364 3.4s-2.367-1.521-2.367-3.4C7.058 2.518 8.118 1 9.425 1z" fill="#2932E1" fill-rule="nonzero"></path></svg>'},{id:"google",name:"Google",url:"https://www.google.com/ncr",svg:'<svg height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Google</title><path d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z" fill="#4285F4"></path><path d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z" fill="#34A853"></path><path d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z" fill="#FBBC05"></path><path d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z" fill="#EB4335"></path></svg>'},{id:"github",name:"GitHub",url:"https://github.com",svg:'<svg fill="currentColor" fill-rule="evenodd" height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Github</title><path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"></path></svg>'},{id:"bilibili",name:"Bilibili",url:"https://www.bilibili.com",svg:'<svg height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>bilibili</title><path clip-rule="evenodd" d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z" fill="#1b7be1" fill-rule="evenodd"></path></svg>'}];function Ie(t){C(t,_("Restarting Service"),"neutral"),h.exec("/etc/init.d/hijpass",["restart"]).then(function(e){e.code===0?(C(t,_("Service Restarted"),"success"),setTimeout(function(){location.reload()},2e3)):C(t,_("Service Restart Failed")+(e.stderr||e.stdout),"error")}).catch(function(e){C(t,_("Service Restart Failed")+e.message,"error")})}function Me(t){C(t,_("Refreshing Firewall"),"neutral"),h.exec("/usr/lib/hijpass/firewall/firewall.sh",["reset"]).then(function(e){e.code===0?C(t,_("Firewall Refreshed"),"success"):C(t,_("Firewall Refresh Failed")+(e.stderr||e.stdout),"error")}).catch(function(e){C(t,_("Firewall Refresh Failed")+e.message,"error")})}function C(t,e,n){t.textContent=e,t.style.color=n==="success"?"#4caf50":n==="error"?"#f44336":"#666"}function ke(t){let e=E("div",{style:"font-size: 13px; color: #f44336;"},_("Click to Test")),n;return n=E("div",{class:"connectivity-btn cbi-section",style:"width: 100%; height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 15px; border-radius: 8px; padding: 0; box-shadow: 0 0 2rem 0 rgba(136, 152, 170, .15); border:1px solid rgba(0, 0, 0, .05); cursor: pointer;",click:function(){Ye(t.url,n,e)}},[E("div",{style:"display: flex; align-items: center; justify-content: center;"},[E("span",{style:"width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"},[E("raw",{},t.svg)])]),E("div",{style:"font-weight: bold; font-size: 16px; margin-bottom: 2px;"},_(t.name)),e]),E("div",{class:"connectivity-test-button",style:"flex: 1; min-width: 120px;"},[n])}function Ye(t,e,n){e.dataset.loading!=="1"&&(n.textContent=_("Testing"),n.style.color="#666",e.dataset.loading="1",e.style.opacity="0.7",h.exec_direct("/usr/lib/hijpass/network/network.sh",["connect",t,"5"],"json").then(r=>{Lt(e,n,r.success,r)}).catch(r=>{console.error(r),Lt(e,n,!1,void 0)}))}function Lt(t,e,n,r){delete t.dataset.loading,t.style.opacity="1",n?/^([45])\d{2}$/.test(r.http_code)?(e.textContent=_("Connection Abnormal")+r.http_code,e.style.color="#f44336"):(e.textContent=r.tls_handshake_time_ms+" ms",e.style.color="#4caf50"):(e.textContent=_("Test Failed"),e.style.color="#f44336")}var at={createActionButtons:function(){let t=E("span",{style:"margin-left: 10px; font-size: 12px; color: #666;"});return E("div",{class:"cbi-value",style:"margin-bottom: 2rem;"},[E("label",{class:"cbi-value-title",style:"visibility: hidden"},_("Service Control")),E("div",{class:"cbi-value-field"},[E("button",{class:"cbi-button cbi-button-action",style:"margin-right: 10px;",type:"button",click:function(e){e.preventDefault(),Ie(t)}},_("Restart Service")),E("button",{class:"cbi-button cbi-button-action",style:"margin-right: 10px;",type:"button",click:function(e){e.preventDefault(),Me(t)}},_("Refresh Firewall")),t])])},createConnectivityTest:function(){return E("div",{id:"custom-connectivity-test",class:"cbi-map"},[E("h2",{},_("Website Connectivity Test")),E("div",{class:"cbi-section",style:"display: flex; gap: 18px; padding: 18px; justify-content: center;"},Ue.map(t=>ke(t)))])}};function W(t){return a.get_first("hijpass",t)||{}}function K(t){return t?(Array.isArray(t)?t:[t]).filter(Boolean):[]}function O(t){let e=Number(t);return Number.isInteger(e)&&e>0&&e<=65535}function jt(t){return t?t.replace("#",":"):_("Not configured")}function He(t){return t.acl_default_allow==="1"?_("Bypass mode"):_("Proxy mode")}function Mt(t){return _("Firewall ACL")+" \xB7 "+He(t)}function lt(t){if(t.acl_default_allow==="1"){let r=K(t.proxy_mac_exclude_list).length,o=K(t.proxy_iface_exclude_list).length;return _("Excluded: %s devices, %s interfaces").format(String(r),String(o))}let e=K(t.proxy_mac_list).length,n=K(t.proxy_iface_list).length;return _("Selected: %s devices, %s interfaces").format(String(e),String(n))}function kt(t,e){if(!O(t))return[{title:e,detail:_("No valid listen port"),tone:"warning",page:"firewall"}];let n=m.getProxySectionMap(),r=Array.from(n.values()).find(s=>s.enabled==="1"&&s.listen_port===t),o=[{title:e+": "+t,tone:"proxy",page:"firewall"}];if(!r)return o.push({title:_("Proxy node unavailable"),detail:_("No enabled node uses this port"),tone:"warning",page:"proxy"}),o;if(r.type===u.LOAD_BALANCE){let s=m.normalizeProxyNodeList(r.member_node);return o.push({title:_("Load balancing: %s").format(r.name),page:"proxy",detail:s.length>0?_("Members: %s").format(s.join(", ")):_("No member nodes"),tone:s.length>0?"proxy":"warning"}),o}o.push({title:_("Proxy node: %s").format(r.name),page:"proxy",detail:m.getProxyCore(r),tone:"proxy"});let i=m.collectProxyChain(r.name,n);return i.chain.slice(1).forEach(s=>{let l=n.get(s);o.push({title:_("Upstream proxy: %s").format(s),page:"proxy",detail:l?.socks_port?_("SOCKS port %s").format(l.socks_port):_("Node unavailable"),tone:l?"proxy":"warning"})}),i.cycle&&o.push({title:_("Proxy dependency cycle"),tone:"warning",page:"proxy"}),o}function ct(t,e){let n=e==="dns"?t.dns_listen_port:t.shunt_listen_port,r=e==="dns"?_("Core DNS"):_("Default shunt port");if(t.enabled==="0"||!O(n))return[{title:r,detail:_("Disabled or invalid listen port"),tone:"warning",page:"shunt"}];if(e==="traffic")return[{title:r+": "+n,tone:"proxy",page:"firewall"},{title:_("Default shunt"),detail:t.type==="xray"?"Xray":t.type||"",tone:"proxy",page:"shunt"}];let o=[{title:r+": "+n,page:"shunt",detail:t.type==="xray"?"Xray":t.type||"",tone:"proxy"}];if(t.config_type==="custom")return o.push({title:_("Custom core configuration"),detail:_("Internal path cannot be expanded"),tone:"muted",page:"shunt"}),o;let s=a.sections("hijpass","shunt_route_rule").filter(l=>l.enabled==="1").filter(l=>!!l.dns_node);return o.push({title:_("DNS routing rules"),page:"shunt",detail:_("%s enabled rules, default DNS: %s").format(String(s.length),t.default_dns_node||_("Not configured")),tone:"normal"}),o}function Ut(t,e,n){if(t==="custom")return[{title:_("Custom DNS"),detail:jt(e),tone:"normal",page:"dns"}];if(t==="dnsmasq"||t==="system"){let o=a.get_first("dhcp","dnsmasq","port")||"53";return[{title:"dnsmasq",detail:_("Local port %s").format(o),tone:"direct",page:"dhcp"}]}let r=n.dns_listen_port||"";return t===w.ROUTING||t==="127.0.0.1#"+r?ct(n,"dns"):[{title:_("DNS upstream"),detail:jt(t),tone:"normal",page:"dns"}]}function Be(t,e,n,r){let o=U.getSource(),i=o===w.NONE?lt(e):[lt(e),e.proxy_local==="1"?_("Router traffic included"):_("Router traffic excluded")].join(`
`),s=[{title:_("Client DNS query"),detail:_("TCP/UDP port 53")},{title:Mt(e),detail:i,page:"firewall"}];if(o===w.NONE)return s.push({title:_("No DNS redirect"),detail:_("Keep the original destination"),tone:"muted",page:"firewall"}),{id:"dns",title:_("DNS flow"),steps:s};if(o===w.ROUTING)return s.push(...ct(r,"dns")),{id:"dns",title:_("DNS flow"),steps:s};if(o!==w.PRE_ROUTING)return s.push({title:_("Unknown DNS forwarding source"),detail:o,tone:"warning"}),{id:"dns",title:_("DNS flow"),steps:s};if(n.dns_service!=="chinadns-ng"||!O(n.cdg_port))return s.push({title:_("Independent DNS unavailable"),detail:_("Disabled or invalid listen port"),tone:"warning",page:"dns"}),{id:"dns",title:_("DNS flow"),steps:s};s.push({title:_("Independent DNS: %s").format(n.cdg_port),detail:"chinadns-ng",tone:"proxy",page:"dns"});let l=[],c=[];return t.domain_direct&&l.push(_("Custom direct domain list")),t.domain_proxy&&c.push(_("Custom proxy domain list")),n.use_chn==="1"&&l.push(_("CHN domain list")),n.use_gfw==="1"&&c.push(_("GFW domain list")),{id:"dns",title:_("DNS flow"),steps:s,branches:[{condition:_("Direct domain branch"),page:"dns",detail:l.join(" + ")||void 0,steps:Ut(n.direct_dns,n.direct_dns_custom,r)},{condition:_("Proxy domain branch"),page:"dns",detail:c.join(" + ")||void 0,steps:Ut(n.proxy_dns,n.proxy_dns_custom,r)}]}}function Yt(t,e){let n=t.shunt_port||"";return O(n)?n===e.shunt_listen_port?ct(e,"traffic"):kt(n,_("Default shunt port")):[{title:_("Direct"),detail:_("Default shunt port is disabled"),tone:"direct",page:"firewall"}]}function It(t,e){return O(t.proxy_port)?kt(t.proxy_port,_("Proxy port")):O(t.shunt_port)?Yt(t,e):[{title:_("No proxy target"),tone:"warning",page:"firewall"}]}function Xe(t,e,n,r){let o=(e.tproxy_proto||"").split(",").filter(Boolean).map(A=>A.toUpperCase()),i={title:_("Client traffic"),page:"firewall",detail:o.join(" + ")||_("No protocol selected")},s={title:Mt(e),page:"firewall",detail:[lt(e),e.proxy_local==="1"?_("Router traffic included"):_("Router traffic excluded")].join(`
`)},l=O(e.proxy_port),c=O(e.shunt_port);if(!l&&!c)return{id:"traffic",title:_("Traffic flow"),steps:[i,s,{title:_("No proxy target"),tone:"warning",page:"firewall"}]};let p=[];return(t.ip_proxy||n.dns_service==="chinadns-ng"&&t.domain_proxy)&&p.push({condition:_("Forced proxy address"),page:"firewall",steps:It(e,r)}),(t.ip_direct||n.dns_service==="chinadns-ng"&&t.domain_direct)&&p.push({condition:_("Forced direct address"),page:"firewall",steps:[{title:_("Direct"),tone:"direct"}]}),n.dns_service==="chinadns-ng"&&n.use_gfw==="1"&&p.push({condition:_("GFW domain set"),page:"dns",steps:It(e,r)}),c&&n.dns_service==="chinadns-ng"&&n.use_chn==="1"&&p.push({condition:_("CHN domain set"),page:"dns",steps:[{title:_("Direct"),tone:"direct"}]}),c&&e.use_chnroute==="1"&&p.push({condition:_("CHN route set"),page:"firewall",steps:[{title:_("Direct"),tone:"direct"}]}),p.push({condition:_("No address rule matched"),steps:Yt(e,r)}),{id:"traffic",title:_("Traffic flow"),steps:[i,s],branches:p,branchMode:"ordered",branchDescription:_("Address rules are evaluated from top to bottom")}}function Ht(){let t=W("hijpass"),e=W("firewall"),n=W("dns"),r=W("shunt");return{diagrams:[Be(t,e,n,r),Xe(t,e,n,r)]}}var Ge=`
    a.hijpass-flow-step,
    a.hijpass-flow-branch__condition {
        display: block;
        color: inherit;
        text-decoration: none;
    }

    a.hijpass-flow-step:hover,
    a.hijpass-flow-branch__condition:hover {
        border-color: var(--primary-color, #4b6cb7);
    }

    a.hijpass-flow-step:focus-visible,
    a.hijpass-flow-branch__condition:focus-visible {
        outline: 2px solid var(--primary-color, #4b6cb7);
        outline-offset: 2px;
    }

    .hijpass-flow-card h3 {
        margin: 0;
    }

    .hijpass-flow-step[data-tone="warning"] {
        color: var(--warning-color, #b26a00);
    }

    .hijpass-flow-list {
        display: grid;
        gap: 1rem;
    }

    .hijpass-flow-card {
        --hijpass-flow-node-width: 14rem;
        --hijpass-flow-condition-width: 13rem;
        box-sizing: border-box;
        min-width: 0;
        padding: 1rem;
    }

    .hijpass-flow-scroll {
        max-width: 100%;
        margin-top: .75rem;
        padding: 0 0 .5rem;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-inline: contain;
        scrollbar-gutter: stable;
    }

    .hijpass-flow-scroll:focus-visible {
        outline: 2px solid var(--primary-color, #4b6cb7);
        outline-offset: 2px;
    }

    .hijpass-flow-tree {
        display: flex;
        align-items: center;
        width: max-content;
        min-width: max-content;
    }

    .hijpass-flow-chain {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: .5rem;
        width: max-content;
        min-width: max-content;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .hijpass-flow-chain > li:not(.hijpass-flow-arrow) {
        display: flex;
        flex: 0 0 var(--hijpass-flow-node-width);
        width: var(--hijpass-flow-node-width);
    }

    .hijpass-flow-step {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        padding: .75rem;
        border: 1px solid rgba(127, 127, 127, .45);
        border-left-width: 4px;
        border-radius: 4px;
        overflow-wrap: anywhere;
    }

    .hijpass-flow-step[data-tone="proxy"] {
        border-left-color: var(--primary-color, #4b6cb7);
    }

    .hijpass-flow-step[data-tone="direct"] {
        border-left-color: var(--success-color, #2e7d32);
    }

    .hijpass-flow-step[data-tone="muted"] {
        opacity: .7;
    }

    .hijpass-flow-step[data-tone="warning"] {
        border-left-color: currentColor;
    }

    .hijpass-flow-step__detail,
    .hijpass-flow-branch__detail {
        display: block;
        margin-top: .25rem;
        color: var(--text-color-medium, #777);
        font-size: .8125rem;
        line-height: 1.4;
    }

    .hijpass-flow-step__detail {
        white-space: pre-line;
    }

    .hijpass-flow-arrow {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        color: var(--text-color-medium, #777);
        font-size: 1.25rem;
    }

    .hijpass-flow-branches {
        position: relative;
        display: grid;
        gap: .75rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .hijpass-flow-branches--parallel {
        margin-left: 1.5rem;
    }

    .hijpass-flow-branches--parallel::before {
        position: absolute;
        top: 50%;
        right: 100%;
        width: 1.5rem;
        border-top: 2px solid rgba(127, 127, 127, .6);
        content: '';
    }

    .hijpass-flow-branch {
        display: grid;
        align-items: stretch;
        gap: .5rem;
        min-height: 4.25rem;
    }

    .hijpass-flow-branch--parallel {
        grid-template-columns: 1.5rem var(--hijpass-flow-condition-width) 1.5rem auto;
    }

    .hijpass-flow-branch__joint {
        position: relative;
        display: flex;
        align-self: stretch;
        align-items: center;
        justify-content: flex-end;
        color: var(--text-color-medium, #777);
        font-size: 1.25rem;
        line-height: 1;
    }

    .hijpass-flow-branch__joint::after {
        position: absolute;
        top: -.375rem;
        bottom: -.375rem;
        left: 0;
        border-left: 2px solid rgba(127, 127, 127, .6);
        content: '';
    }

    .hijpass-flow-branch--parallel:first-child .hijpass-flow-branch__joint::after {
        top: 50%;
    }

    .hijpass-flow-branch--parallel:last-child .hijpass-flow-branch__joint::after {
        bottom: 50%;
    }

    .hijpass-flow-branch--parallel:only-child .hijpass-flow-branch__joint::after {
        display: none;
    }

    .hijpass-flow-branch__condition {
        box-sizing: border-box;
        width: var(--hijpass-flow-condition-width);
        padding: .75rem;
        border: 1px dashed rgba(127, 127, 127, .55);
        border-radius: 4px;
        overflow-wrap: anywhere;
    }

    .hijpass-flow-branch .hijpass-flow-chain {
        margin: 0;
    }

    .hijpass-flow-ordered {
        display: grid;
        grid-template-columns: auto auto auto;
        grid-template-rows: auto auto auto;
        column-gap: .5rem;
        width: max-content;
        min-width: max-content;
        align-items: start;
    }

    .hijpass-flow-ordered__prefix {
        grid-column: 1;
        grid-row: 2;
        align-self: center;
    }

    .hijpass-flow-ordered__entry {
        grid-column: 2;
        grid-row: 2;
        align-self: center;
        width: auto;
    }

    .hijpass-flow-ordered__description {
        display: flex;
        grid-column: 3;
        grid-row: 1;
        align-items: center;
        height: 1.5rem;
        margin: 0 0 .25rem;
        color: var(--text-color-medium, #777);
        font-size: .8125rem;
        line-height: 1.25;
        white-space: nowrap;
    }

    .hijpass-flow-ordered__first,
    .hijpass-flow-ordered__rest {
        grid-column: 3;
    }

    .hijpass-flow-ordered__first {
        grid-row: 2;
        align-self: stretch;
    }

    .hijpass-flow-ordered__rest {
        grid-row: 3;
    }

    .hijpass-flow-branches--ordered {
        gap: 0;
    }

    .hijpass-flow-branch--ordered {
        grid-template-columns: var(--hijpass-flow-condition-width) 1.5rem auto;
    }

    .hijpass-flow-branch--ordered .hijpass-flow-branch__condition,
    .hijpass-flow-branch--ordered .hijpass-flow-step {
        display: flex;
        min-height: 4.25rem;
        flex-direction: column;
        justify-content: center;
    }

    .hijpass-flow-branch--ordered .hijpass-flow-chain {
        align-items: stretch;
    }

    .hijpass-flow-order-arrow {
        display: flex;
        width: var(--hijpass-flow-condition-width);
        height: 1.25rem;
        align-items: center;
        justify-content: center;
        color: var(--text-color-medium, #777);
        font-size: 1rem;
        line-height: 1;
    }

    @media (max-width: 900px) {
        .hijpass-flow-card {
            --hijpass-flow-node-width: 13rem;
            --hijpass-flow-condition-width: 12rem;
        }
    }

`;function ze(){if(document.getElementById("hijpass-flow-preview-styles"))return;let t=document.createElement("style");t.id="hijpass-flow-preview-styles",t.textContent=Ge,document.head.appendChild(t)}function pt(t){return L.url(t==="dhcp"?"admin/network/dhcp":"admin/services/hijpass/"+t)}function Ve(t){return E(t.page?"a":"div",{...t.page?{href:pt(t.page)}:{},class:"hijpass-flow-step","data-tone":t.tone||"normal"},[E("strong",{},t.title),t.detail?E("span",{class:"hijpass-flow-step__detail"},t.detail):""])}function q(t){let e=[];return t.forEach((n,r)=>{e.push(E("li",{},[Ve(n)])),r<t.length-1&&e.push(E("li",{class:"hijpass-flow-arrow","aria-hidden":"true"},"\u2192"))}),E("ol",{class:"hijpass-flow-chain"},e)}function We(t){return E("li",{class:"hijpass-flow-branch hijpass-flow-branch--parallel"},[E("span",{class:"hijpass-flow-branch__joint","aria-hidden":"true"},"\u2192"),E(t.page?"a":"div",{class:"hijpass-flow-branch__condition",...t.page?{href:pt(t.page)}:{}},[E("strong",{},t.condition),t.detail?E("span",{class:"hijpass-flow-branch__detail"},t.detail):""]),E("span",{class:"hijpass-flow-arrow","aria-hidden":"true"},"\u2192"),q(t.steps)])}function Bt(t){return E("li",{class:"hijpass-flow-branch hijpass-flow-branch--ordered"},[E(t.page?"a":"div",{class:"hijpass-flow-branch__condition",...t.page?{href:pt(t.page)}:{}},[E("strong",{},t.condition),t.detail?E("span",{class:"hijpass-flow-branch__detail"},t.detail):""]),E("span",{class:"hijpass-flow-arrow","aria-hidden":"true"},"\u2192"),q(t.steps)])}function Ke(t,e,n){let r=[];return e.slice(1).forEach(o=>{r.push(E("li",{class:"hijpass-flow-order-arrow","aria-hidden":"true"},"\u2193")),r.push(Bt(o))}),E("div",{class:"hijpass-flow-tree hijpass-flow-ordered","data-branch-mode":"ordered"},[E("p",{class:"hijpass-flow-ordered__description"},n||""),E("div",{class:"hijpass-flow-ordered__prefix"},q(t)),E("span",{class:"hijpass-flow-arrow hijpass-flow-ordered__entry","aria-hidden":"true"},"\u2192"),E("ol",{class:"hijpass-flow-branches hijpass-flow-branches--ordered hijpass-flow-ordered__first"},[Bt(e[0])]),r.length>0?E("ol",{class:"hijpass-flow-branches hijpass-flow-branches--ordered hijpass-flow-ordered__rest"},r):""])}function qe(t){return t.branches?.length?E("ul",{class:"hijpass-flow-branches hijpass-flow-branches--parallel"},t.branches.map(We)):""}function $e(t){let e=t.branchMode==="ordered"&&t.branches?.length?Ke(t.steps,t.branches,t.branchDescription):E("div",{class:"hijpass-flow-tree","data-branch-mode":t.branchMode||"parallel"},[q(t.steps),qe(t)]);return E("div",{class:"hijpass-flow-scroll",role:"region","aria-label":t.title,tabindex:"0"},[e])}var Xt={createConfigurationFlowPreview:function(){ze();let t=Ht();return E("div",{class:"hijpass-flow-preview"},[E("div",{class:"cbi-section-descr"},_("Generated from saved settings. Branches show configured decisions, not a live packet trace.")),E("div",{class:"hijpass-flow-list"},t.diagrams.map(e=>E("section",{class:"hijpass-flow-card","aria-labelledby":"hijpass-flow-"+e.id},[E("h3",{id:"hijpass-flow-"+e.id},e.title),$e(e)])))])}};var Je=ut.extend({load:function(){return Promise.all([a.load("hijpass"),a.load("hijserver"),a.load("dhcp")])},handleSaveApply:Rt.genHandleSaveApply(),render:async function(){let t=new f.Map("hijpass",_("HiJpass"));v.createStatusSection(t);let e=t.section(f.TypedSection,"hijpass");e.anonymous=!0,e.addremove=!1,e.tab("configuration",_("Configuration")),e.tab("flow",_("Flow preview"));let n=e.taboption("configuration",f.Flag,"enabled",_("Enable"),_("Enable or Disable HiJpass"));n.default="0",n.rmempty=!1;let r=e.taboption("configuration",f.Value,"delay_time",_("Delay Time"),_("Startup Delay"));r.datatype="uinteger",r.default="60",r.rmempty=!1;let o=e.taboption("configuration",f.ListValue,"log_level",_("Log Level"),_("Service Log Level"));o.modalonly=!0,o.value("DEBUG",_("Debug")),o.value("INFO",_("Info")),o.value("WARN",_("Warning")),o.value("ERROR",_("Error")),o.default="INFO",o.rmempty=!1;let i=e.taboption("configuration",f.Button,"_preview");i.render=function(){return at.createActionButtons()};let s=e.taboption("flow",f.DummyValue,"_flow_preview");s.render=Xt.createConfigurationFlowPreview;let l=t.section(f.TypedSection,"connectivity_test_section");return l.anonymous=!0,l.addremove=!1,l.render=at.createConnectivityTest,t.render()}}),Qe=Je;return qt(Ze);})();


return LuciView.default;
