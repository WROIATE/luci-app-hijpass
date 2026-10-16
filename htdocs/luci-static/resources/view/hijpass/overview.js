
'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

var LuciView=(()=>{var $=Object.defineProperty;var Ye=Object.getOwnPropertyDescriptor;var He=Object.getOwnPropertyNames;var Be=Object.prototype.hasOwnProperty;var Xe=(e,t)=>{for(var n in t)$(e,n,{get:t[n],enumerable:!0})},Ge=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of He(t))!Be.call(e,o)&&o!==n&&$(e,o,{get:()=>t[o],enumerable:!(r=Ye(t,o))||r.enumerable});return e};var Ve=e=>Ge($({},"__esModule",{value:!0}),e);var Kt={};Xe(Kt,{default:()=>Wt});var f={LOAD_BALANCE:"load_balance",HYSTERIA2:"hysteria2",SHADOWSOCKS:"shadowsocks",TUIC:"tuic",SHADOWTLS:"shadowtls",VLESS:"vless"},p={XRAY:"xray",SING_BOX:"sing-box",CUSTOM:"custom"},x={NONE:"none",PRE_ROUTING:"pre-routing",ROUTING:"routing"};function H(e){let t=(e||"").trim();return t==="singbox"?p.SING_BOX:t}var Jt={[p.XRAY]:[f.SHADOWSOCKS,f.HYSTERIA2,f.VLESS],[p.SING_BOX]:[f.SHADOWSOCKS,f.HYSTERIA2,f.VLESS,f.TUIC,f.SHADOWTLS]},$t={DNS_STRATEGY_VALUES:[{label:"Prefer IPv6 (sing-box only, xray uses dual stack by default)",value:"64"},{label:"Prefer IPv4 (sing-box only, xray uses dual stack by default)",value:"46"},{label:"IPv6 only",value:"6"},{label:"IPv4 only",value:"4"}],SHUNT_LOG_LEVELS:["info","warn","error","debug"],PROXY_LOG_LEVELS:["info","warn","error","debug"],SHUNT_CONF_TYPE:[p.XRAY,p.SING_BOX],PROXY_TYPES:[{label:"Load Balancing",value:"load_balance"},{label:"Shadowsocks",value:"shadowsocks"},{label:"Hysteria2",value:"hysteria2"},{label:"VLESS",value:"vless"},{label:"TUIC",value:"tuic"},{label:"ShadowTLS",value:"shadowtls"}],SHADOWSOCKS_METHODS:[{label:"2022-blake3-aes-128-gcm",value:"2022-blake3-aes-128-gcm"},{label:"2022-blake3-aes-256-gcm",value:"2022-blake3-aes-256-gcm"},{label:"2022-blake3-chacha20-poly1305",value:"2022-blake3-chacha20-poly1305"},{label:"aes-128-gcm",value:"aes-128-gcm"},{label:"aes-192-gcm",value:"aes-192-gcm"},{label:"aes-256-gcm",value:"aes-256-gcm"},{label:"chacha20-ietf-poly1305",value:"chacha20-ietf-poly1305"},{label:"xchacha20-ietf-poly1305",value:"xchacha20-ietf-poly1305"}],MULTIPLEX_PROTOCOLS:[{label:"smux",value:"smux"},{label:"yamux",value:"yamux"},{label:"h2mux",value:"h2mux"}],TUIC_CONGESTION_CONTROLS:[{label:"cubic",value:"cubic"},{label:"new_reno",value:"new_reno"},{label:"bbr",value:"bbr"}],TUIC_UDP_RELAY_MODES:[{label:"Native UDP",value:"native"},{label:"QUIC Stream",value:"quic"}],SHADOWTLS_VERSIONS:[{label:"v1",value:"1"},{label:"v2",value:"2"},{label:"v3",value:"3"}],VLESS_FLOWS:[{label:"None",value:""},{label:"xtls-rprx-vision",value:"xtls-rprx-vision"},{label:"xtls-rprx-vision-udp443",value:"xtls-rprx-vision-udp443"}],VLESS_PACKET_ENCODINGS:[{label:"Disabled",value:""},{label:"packetaddr",value:"packetaddr"},{label:"xudp",value:"xudp"}],V2RAY_TRANSPORT_TYPES_XRAY:[{label:"None",value:""},{label:"HTTP",value:"http"},{label:"WebSocket",value:"ws"},{label:"gRPC",value:"grpc"},{label:"HTTPUpgrade",value:"httpupgrade"},{label:"XHTTP",value:"xhttp"}],HYSTERIA2_OBFS_TYPES:[{label:"Disabled",value:""},{label:"Salamander",value:"salamander"}],DUAL_CORES:[{label:"sing-box",value:p.SING_BOX},{label:"xray",value:p.XRAY},{label:"Custom",value:p.CUSTOM}]};var de=view;var a=uci;var h=form;var R=ui;var B=rpc;function d(e,t=[]){let n=B.declare({object:"hijpass",method:e,params:t,reject:!0,expect:{"":{error:"Invalid backend response"}}});return async(...r)=>{let o=await n(...r);if(o.error)throw new Error(o.error);return o}}var ze=d("editor_read",["resource","section","name"]),We=d("editor_write",["resource","section","name","content"]),ue=d("log_read",["id","action","lines"]),Ke=d("firewall_show"),qe=d("firewall_template_default"),Je=d("log_list"),$e=d("job_status",["id"]),Ze=d("job_release",["id"]);async function Z(e,t,...n){let{id:r}=await e(...n);if(typeof r!="string"||!/^[A-Za-z0-9]{8}$/.test(r))throw new Error("Invalid job ID");let o=!1;try{let i=Date.now()+18e5;for(;Date.now()<i;){let s=await $e(r);if(!s.running){o=!0;let l=t?JSON.parse(s.stdout||"{}"):s;if(l.error)throw new Error(l.error);if(s.code!==0)throw new Error(s.stderr||"Backend job failed");return l}await new Promise(l=>window.setTimeout(l,1e3))}throw new Error("Timed out waiting for backend job")}finally{o&&await Ze(r).catch(console.error)}}var Qe={version:d("core_version",["core"]),latest:d("core_latest",["core"]),update:e=>Z(d("core_update",["core"]),!0,e)},y={defaultFirewallTemplate:async()=>(await qe()).content,readEditor:async e=>(await ze(e.resource,e.section||"",e.name||"")).content,writeEditor:(e,t)=>We(e.resource,e.section||"",e.name||"",t),writeConfigs:d("config_write",["sections"]),logList:async()=>(await Je()).logs,readLog:async(e,t="200")=>(await ue(e,"read",t)).content,downloadLog:e=>ue(e,"download",""),clearLog:d("log_clear",["id"]),logSettings:d("log_settings",["package","section","name"]),defaults:d("defaults"),cleanupNode:d("cleanup_node",["kind","section","name"]),restartService:()=>Z(d("service_restart"),!1),resetFirewall:d("firewall_reset"),showFirewall:async()=>{let e=await Ke();if(e.code!==0)throw new Error(e.stderr||"Cannot read firewall rules");return e.stdout},connect:d("network_connect",["url","timeout"]),ping:d("network_ping",["port"]),updateRules:()=>Z(d("rule_update"),!0),queryRules:d("rule_query",["keyword"]),matchRule:d("rule_match",["keyword"]),lookupGeo:d("geo_lookup",["type","keyword","mode"]),queryGeo:d("geo_query",["keyword"]),coreAction:(e,t)=>Qe[e](t),startTrace:d("trace_start",["args"]),traceStatus:d("trace_status",["id"]),releaseTrace:d("trace_release",["id"])};async function et(e){async function t(n,r,o=""){let i=await y.cleanupNode(n,r,o);if(i.code!==0)throw new Error(i.stderr||_("Configuration cleanup failed"))}if(e?.hijpass){for(let n of e.hijpass)if(n.length===2&&n[0]==="remove"&&await t("proxy",n[1]),n.length===4&&n[0]==="set"&&n[2]==="name"){let r=a.get("hijpass",n[1]),o=r?.name||r?.[".name"]||"";await t("proxy",n[1],o)}}if(e?.hijserver){for(let n of e.hijserver)if(n.length===2&&n[0]==="remove"&&await t("server",n[1]),n.length===4&&n[0]==="set"&&n[2]==="name"){let r=a.get("hijserver",n[1]),o=r?.name||r?.[".name"]||"";await t("server",n[1],o)}}}var ge={cleanupChangedNodeFiles:et};var Q=class{container=null;notifications=new Map;notificationId=0;autoCloseTimers=new Map;constructor(){this.initContainer()}initContainer(){this.container||(this.container=document.createElement("div"),this.container.id="notification-container",this.container.style.cssText=`
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            pointer-events: none;
        `,document.body.appendChild(this.container))}getTypeConfig(t){let n={success:{bgColor:"#4caf50",borderColor:"#45a049",icon:"\u2713",textColor:"#fff"},error:{bgColor:"#f44336",borderColor:"#da190b",icon:"\u2715",textColor:"#fff"},warning:{bgColor:"#ff9800",borderColor:"#e68900",icon:"\u26A0",textColor:"#fff"},info:{bgColor:"#2196f3",borderColor:"#0b7dda",icon:"\u2139",textColor:"#fff"}};return n[t]||n.info}show(t){let{message:n,title:r,content:o,type:i="info",duration:s=3e3,icon:l=!1}=t;this.initContainer();let c=`notification-${++this.notificationId}`,u=this.getTypeConfig(i),D=r||n,pe=o,v=document.createElement("div");if(v.id=c,v.style.cssText=`
            background-color: ${u.bgColor};
            border-left: 4px solid ${u.borderColor};
            color: ${u.textColor};
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
        `,l){let m=document.createElement("span");m.style.cssText=`
                font-size: 20px;
                font-weight: bold;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                margin-top: 2px;
            `,m.textContent=u.icon,v.appendChild(m)}let k=document.createElement("div");if(k.style.cssText=`
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `,D){let m=document.createElement("div");m.style.cssText=`
                font-weight: 600;
                font-size: 14px;
                line-height: 1.4;
            `,m.textContent=D,k.appendChild(m)}if(pe){let m=document.createElement("div");m.style.cssText=`
                font-weight: 400;
                font-size: 13px;
                line-height: 1.4;
                opacity: 0.9;
                white-space: pre-line;
            `,m.textContent=pe,k.appendChild(m)}v.appendChild(k);let T=document.createElement("button");if(T.style.cssText=`
            background: none;
            border: none;
            color: ${u.textColor};
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
        `,T.innerHTML="\xD7",T.onmouseover=()=>T.style.opacity="1",T.onmouseout=()=>T.style.opacity="0.7",T.onclick=m=>{m.stopPropagation(),this.remove(c)},v.appendChild(T),this.container.appendChild(v),this.notifications.set(c,v),s>0){let m=setTimeout(()=>{this.remove(c)},s);this.autoCloseTimers.set(c,m),v.onmouseenter=()=>{let Y=this.autoCloseTimers.get(c);Y&&(clearTimeout(Y),this.autoCloseTimers.delete(c))},v.onmouseleave=()=>{if(this.notifications.has(c)){let Y=setTimeout(()=>{this.remove(c)},s);this.autoCloseTimers.set(c,Y)}}}return c}remove(t){let n=this.notifications.get(t);if(!n)return;let r=this.autoCloseTimers.get(t);r&&(clearTimeout(r),this.autoCloseTimers.delete(t)),n.style.animation="slideOutRight 0.3s ease-in",n.style.opacity="0",setTimeout(()=>{n.remove(),this.notifications.delete(t)},300)}success(t,n){return this.show({message:t,type:"success",duration:n})}error(t,n){return this.show({message:t,type:"error",duration:n})}warning(t,n){return this.show({message:t,type:"warning",duration:n})}info(t,n){return this.show({message:t,type:"info",duration:n})}clear(){this.notifications.forEach((t,n)=>{this.remove(n)})}},tt=new Q;function fe(){if(document.getElementById("notification-styles"))return;let e=document.createElement("style");e.id="notification-styles",e.textContent=`
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
    `,document.head.appendChild(e)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",fe):fe();var P=tt;var U={show:function(e){return P.show(e)},success:function(e,t,n){return P.show({title:e,content:t,type:"success",duration:n})},error:function(e,t,n){return P.show({title:e,content:t,type:"error",duration:n})},warning:function(e,t,n){return P.show({title:e,content:t,type:"warning",duration:n})},info:function(e,t,n){return P.show({title:e,content:t,type:"info",duration:n})},clear:function(){return P.clear()}};var I={setAnonymousGridSectionMembers:function(e){I.setGridSectionMembers(e),e.anonymous=!0,e.sectiontitle=function(t){return a.get("hijpass",t,"name")||a.get("hijpass",t,"tag")||t}},setGridSectionMembers:function(e){e.anonymous=!1,e.addremove=!0,e.sortable=!0,e.nodescriptions=!0,e.rowcolors=!0},setAnonymousSection:function(e){e.anonymous=!0,e.addremove=!1},simpleHash:function(e){let t=0;e=e||"";for(let n=0;n<e.length;n++)t=(t<<5)-t+e.charCodeAt(n),t|=0;return t},setEditorOptionMembers:function(e,t,n){e.rows=30,e.load=function(o){return y.readEditor(t).then(i=>i.trim())};async function r(o,i){let s=String(I.simpleHash(i)),l=a.get("hijpass",o,n);s!==l&&(await y.writeEditor(t,i||""),a.set("hijpass",o,n,s))}return e.write=r,e.remove=r,e.monospace=!0,e},setConfContentOptionMembers:function(e,t){e.monospace=!0,e.rows=20,e.load=async function(n){return y.readEditor({resource:t==="hijserver"?"server_config":"proxy_config",section:n})},e.write=async function(n,r){let o=(r||"").trim().replace(/\r\n/g,`
`),i=o?o+`
`:"";await y.writeEditor({resource:t==="hijserver"?"server_config":"proxy_config",section:n,name:this.section.formvalue(n,"name")||a.get(t,n,"name")||n},i),a.set(t,n,"custom_conf_hash",String(I.simpleHash(i)))},e.remove=async function(n){await y.writeEditor({resource:t==="hijserver"?"server_config":"proxy_config",section:n,name:this.section.formvalue(n,"name")||a.get(t,n,"name")||n},""),a.set(t,n,"custom_conf_hash","")}},createTextOption:function(e,t,n,r,o,i){let s=e.taboption(t,h.TextValue,n,r,o);return I.setEditorOptionMembers(s,i,n),s},createLogFlagOption:function(e,t,n){let r=n?e.taboption(n,h.Flag,"log_enabled",_("Record Logs")):e.option(h.Flag,"log_enabled",_("Record Logs"));return r.modalonly=!0,r.write=async function(o){let i=this.section.formvalue(o,"name")||a.get(t,o,"name")||"",s=await y.logSettings(t,o,i);a.set(t,o,"log_path",s.path)},r.remove=function(o){a.unset(t,o,"log_path")},r.load=function(o){return a.get(t,o,"log_path")?"1":"0"},r.rmempty=!0,r},appendEnabledNodeListenPorts:function(e){a.sections("hijpass","proxy_node",t=>{if(t.listen_port&&t.enabled==="1"){let n=_("Proxy node %s: %s").format(t.name,t.listen_port);e.value(t.listen_port,n)}})},loadProxyNodeOptions:function(e,t=!0){e.load=function(n){return delete this.keylist,delete this.vallist,this.value("hijpass-direct",_("Direct")),t&&this.value("hijpass-block",_("Block")),a.sections("hijpass","proxy_node",function(r){if(r.name&&r.enabled==="1"){let o=r.name;r.socks_port&&(o+=" ("+r.socks_port+")"),this.value(r.name,o)}}.bind(this)),h.ListValue.prototype.load.apply(this,[n])}},getEnabledProxyNodeOptions:function(e=!0){let t=[];return e&&(t.push({value:"hijpass-direct",label:_("Direct")}),t.push({value:"hijpass-block",label:_("Block")})),a.sections("hijpass","proxy_node",n=>{if(n.name&&n.enabled==="1"){let r=n.name;n.socks_port&&(r+=" ("+n.socks_port+")"),t.push({value:n.name,label:r})}}),t}};var X=class{tag;type;server;port},G=class{defaultDnsNode;defaultStrategy;rulesetDnsNode;useCache;nodes;constructor(){this.nodes=[]}},M=class{enabled;name;proxyNode;ipVersionSplit;proxyNodeV4;proxyNodeV6;protocol;network;port;portRange;domainList;ipList;dnsNode;dnsProxyNode;dnsStrategy;constructor(){this.port=[],this.portRange=[],this.network=[],this.protocol=[],this.ipVersionSplit="0"}},V=class{defaultProxyNode;rulesetOutNode;rulesetConvert;rules;constructor(){this.rules=[]}},z=class{type;configType;shuntListenPort;dnsListenPort;logLevel;logPath;route;dns},W=class{domain;domainRegex;domainKeyword;domainSuffix;ipCidr;network;protocol;port;portRange;ipVersion;ruleSet;geoIp;geoSite;constructor(){this.domain=[],this.domainRegex=[],this.domainKeyword=[],this.domainSuffix=[],this.ruleSet=[],this.ipCidr=[],this.geoIp=[],this.geoSite=[],this.network=[],this.protocol=[],this.port=[],this.portRange=[]}containDomain(){return this.domain.length>0||this.domainRegex.length>0||this.domainSuffix.length>0||this.domainKeyword.length>0}containGeo(){return this.geoSite.length>0||this.geoIp.length>0}containRuleSet(){return this.ruleSet.length>0}containIp(){return this.ipCidr.length>0||this.geoIp.length>0}isEmpty(t){return!(this.containDomain()||this.containIp()||t==="geo"&&this.containGeo()||t==="set"&&this.containRuleSet()||this.network.length>0||this.port.length>0||this.portRange.length>0||this.protocol.length>0)}};var F={camelToSnake:function(e){return e.replace(/([A-Z])/g,function(t){return"_"+t.toLowerCase()})},transFromUci:function(e,t){Object.keys(e).forEach(n=>{let r=F.camelToSnake(n);t[r]&&(e[n]=t[r])})},generateUniqueSectionId:function(e="hijpass"){let t="abcdefghijklmnopqrstuvwxyz0123456789",n="";for(;;){n="";for(let r=0;r<8;r++)n+=t.charAt(Math.floor(Math.random()*t.length));if(!a.get(e,n))break}return n}};var N={getShuntSection:function(){let e=new z,t=a.get_first("hijpass","shunt");return F.transFromUci(e,t),e.dns=N.getDnsSection(),e.route=N.getRouteSection(),e},getRouteSection:function(){let e=a.get_first("hijpass","shunt"),t=new V;return F.transFromUci(t,e),a.sections("hijpass","shunt_route_rule",function(n){let r=new M;F.transFromUci(r,n),t.rules.push(r)}),t},getRouteRuleVariants:function(e){if(e.ipVersionSplit!=="1")return[{rule:e,proxyNode:e.proxyNode}];let t=[];if(e.proxyNodeV4){let n=Object.assign(new M,e);n.name=e.name?e.name+"-ipv4":e.name,n.proxyNode=e.proxyNodeV4,t.push({rule:n,proxyNode:e.proxyNodeV4,ipVersion:4})}if(e.proxyNodeV6){let n=Object.assign(new M,e);n.name=e.name?e.name+"-ipv6":e.name,n.proxyNode=e.proxyNodeV6,t.push({rule:n,proxyNode:e.proxyNodeV6,ipVersion:6})}return t},getDnsSection:function(){let e=a.get_first("hijpass","shunt"),t=new G;return t.nodes=[],F.transFromUci(t,e),a.sections("hijpass","shunt_dns_node",function(n){if(n.enabled==="0")return;let r=new X;F.transFromUci(r,n),t.nodes.push(r)}),t},parseRuleList:function(e){let t=new W,n=e.domainList,r=e.ipList;if(t.network=e.network?e.network:[],t.protocol=e.protocol?e.protocol:[],e.port&&(t.port=e.port.map(o=>parseInt(o,10)).filter(o=>!isNaN(o))),e.portRange&&(t.portRange=e.portRange.map(o=>o.replace("-",":")).filter(o=>o.length>0)),n&&n.trim()!==""){let o=n.split(`
`);for(let i of o)if(i=i.trim(),!(i===""||i.startsWith("#"))){if(i.startsWith("rule-set:")){t.ruleSet.push(i);continue}i.startsWith("regexp:")?t.domainRegex.push(i.substring(7)):i.startsWith("domain:")?t.domainSuffix.push(i.substring(7)):i.startsWith("full:")?t.domain.push(i.substring(5)):i.startsWith("geosite:")?t.geoSite.push(i):t.domainKeyword.push(i)}}if(r&&r.trim()!==""){let o=r.split(`
`);for(let i of o)if(i=i.trim(),!(i===""||i.startsWith("#"))){if(i.startsWith("rule-set:")){t.ruleSet.push(i);continue}i.startsWith("geoip:")?t.geoIp.push(i):t.ipCidr.push(i)}}return t}};function rt(){let e=a.get_first("hijpass","shunt","type");if(e!=="sing-box"&&e!=="singbox"||a.get_first("hijpass","shunt","enabled")==="0"||a.get_first("hijpass","shunt","ruleset_convert")!=="1")return;let t=new Set,n=new Set;for(let r of N.getRouteSection().rules){if(r.enabled!=="1")continue;let o=N.parseRuleList(r);for(let i of o.geoSite)t.add(i.replace("geosite:",""));for(let i of o.geoIp)n.add(i.replace("geoip:",""))}for(let[r,o]of[["geosite_ruleset",[...t]],["geoip_ruleset",[...n]]]){let i=a.get_first("hijpass","shunt",r)??[];JSON.stringify(i)!==JSON.stringify(o)&&a.set_first("hijpass","shunt",r,o.length?o:void 0)}}var _e={updateGeoRules:rt};var ee=3,ot="lb-member-";function he(e){return e?.name||e?.[".name"]||""}function A(e){return H(e?.core||p.SING_BOX)}function te(e){if(!e)return!1;let t=Number(e);return Number.isInteger(t)&&t>0&&t<=65535}function me(){let e=[];return a.sections("hijpass","proxy_node",function(t){e.push(t)}),e}function ne(){let e=new Map;return me().forEach(t=>{let n=he(t);n&&e.set(n,t)}),e}function ye(e){return"upstream-"+e}function re(e){return e?(Array.isArray(e)?e:[e]).filter(t=>!!t):[]}function we(e){return ot+e}function it(e,t=ne()){let n=re(e.member_node);if(n.length===0)throw new Error("Load balancing node has no members: "+e.name);return n.map((r,o)=>{if(r===e.name)throw new Error("Load balancing node cannot include itself: "+r);let i=t.get(r);if(!i)throw new Error("Load balancing member node not found: "+r);if(A(i)!==p.CUSTOM&&i.type===f.LOAD_BALANCE)throw new Error("Nested load balancing members are not supported: "+r);if(i.enabled!=="1")throw new Error("Load balancing member node disabled: "+r);if(!te(i.socks_port))throw new Error("Load balancing member node SOCKS port invalid: "+r);return{name:r,socksPort:Number(i.socks_port),tag:we(o),core:A(i),section:i}})}function st(e,t=ne()){if(A(e)===p.CUSTOM)return;let n=e.upstream_proxy_node;if(!n)return;if(n===e.name)throw new Error("Upstream proxy node cannot be itself: "+n);let r=t.get(n);if(!r)throw new Error("Upstream proxy node not found: "+n);if(r.enabled!=="1")throw new Error("Upstream proxy node disabled: "+n);if(!te(r.socks_port))throw new Error("Upstream proxy node SOCKS port invalid: "+n);return{name:n,socksPort:Number(r.socks_port),tag:ye(n),core:A(r),section:r}}function at(e,t){let n=[],r=new Set,o=e;for(;o;){if(r.has(o))return n.push(o),{chain:n,cycle:!0};r.add(o),n.push(o);let i=t.get(o);if(!i||A(i)===p.CUSTOM||!i.upstream_proxy_node)break;o=i.upstream_proxy_node}return{chain:n,cycle:!1}}function xe(e){if(A(e)===p.CUSTOM)return[];let t=[];return e?.type===f.LOAD_BALANCE?t.push(...re(e.member_node)):e?.upstream_proxy_node&&t.push(e.upstream_proxy_node),t}function lt(e){let t=new Set,n=new Set,r=[];function o(i){if(n.has(i)){let l=r.indexOf(i);return r.slice(l).concat(i)}if(t.has(i))return;let s=e.get(i);if(!(!s||s.enabled!=="1")){n.add(i),r.push(i);for(let l of xe(s)){let c=o(l);if(c)return c}r.pop(),n.delete(i),t.add(i)}}for(let i of e.keys()){let s=o(i);if(s)return s}}var g={getProxyName:he,getProxyCore:A,getProxySections:me,getProxySectionMap:ne,isPort:te,getUpstreamProxyOutboundTag:ye,normalizeProxyNodeList:re,getLoadBalanceMemberOutboundTag:we,resolveUpstreamProxy:st,resolveLoadBalanceMembers:it,collectProxyChain:at,getProxyDependencies:xe,findProxyDependencyCycle:lt};function Ne(e){let t=Number(e);return Number.isInteger(t)&&t>0&&t<=65535}function be(){let e=a.get_first("hijpass","dns"),t=e?.cdg_port||"";return{available:e?.dns_service==="chinadns-ng"&&Ne(t),port:t}}function Ee(){let e=a.get_first("hijpass","shunt"),t=e?.dns_listen_port||"";return{available:e?.enabled!=="0"&&Ne(t),port:t}}function ct(e,t){let n=e;return t.port&&(n+=": "+t.port),t.available||(n+=" - "+_("Not available")),n}var j={getSource:function(){return a.get_first("hijpass","firewall","dns_forward")||x.NONE},getPreRoutingTarget:be,getRoutingTarget:Ee,getTargetLabel:ct,validateSource:function(e){return!e||e===x.NONE?!0:e===x.PRE_ROUTING?be().available?!0:_("Independent DNS is unavailable or has no valid listen port"):e===x.ROUTING?Ee().available?!0:_("Core DNS is disabled or has no valid listen port"):_("Unknown DNS forwarding source: %s").format(e)}};var Se=["http","tls","quic","bittorrent"],pt=["hysteria2","vless"];function dt(e){return e?Array.isArray(e)?e.filter(t=>t):[e]:[]}function ut(e){return e==="hijpass-direct"||e==="hijpass-block"}function w(e,t){return t.length===0?!0:(U.warning(e,t.join(`
`),8e3),!1)}function gt(){return a.get_first("hijpass","shunt","enabled")!=="0"&&a.get_first("hijpass","shunt","config_type")==="tmpl"}function ft(){let e=new Set;a.sections("hijpass","proxy_node",function(i){i.name&&e.add(i.name)});let t=[];function n(i,s){i&&!ut(i)&&!e.has(i)&&t.push(s)}let r=a.get_first("hijpass","shunt","default_proxy_node");r?n(r,_('Default global exit "%s" does not exist').format(r)):t.push(_("Default global exit is not configured"));let o=a.get_first("hijpass","shunt","ruleset_out_node");return n(o,_('Rule-set exit "%s" does not exist').format(o)),a.sections("hijpass","shunt_route_rule",function(i){if(i.enabled!=="1")return;let s=i.name||i[".name"];if(i.ip_version_split==="1"){i.proxy_node_v4?n(i.proxy_node_v4,_('Route rule "%s" IPv4 proxy node "%s" does not exist').format(s,i.proxy_node_v4)):t.push(_('Route rule "%s" IPv4 proxy node is not configured').format(s)),i.proxy_node_v6?n(i.proxy_node_v6,_('Route rule "%s" IPv6 proxy node "%s" does not exist').format(s,i.proxy_node_v6)):t.push(_('Route rule "%s" IPv6 proxy node is not configured').format(s));return}i.proxy_node?n(i.proxy_node,_('Route rule "%s" proxy node "%s" does not exist').format(s,i.proxy_node)):t.push(_('Route rule "%s" proxy node is not configured').format(s))}),w(_("Configuration contains missing proxy nodes"),t)}function _t(){let e=new Set;if(a.sections("hijpass","proxy_node",function(o){o.enabled!=="1"&&o.name&&e.add(o.name)}),e.size===0)return!0;let t=[],n=a.get_first("hijpass","shunt","default_proxy_node");n&&e.has(n)&&t.push(_('Default global exit "%s" is not enabled').format(n));let r=a.get_first("hijpass","shunt","ruleset_out_node");return r&&e.has(r)&&t.push(_('Rule-set exit "%s" is not enabled').format(r)),a.sections("hijpass","shunt_route_rule",function(o){if(o.enabled!=="1")return;let i=o.name||o[".name"];o.ip_version_split==="1"?(o.proxy_node_v4&&e.has(o.proxy_node_v4)&&t.push(_('Route rule "%s" IPv4 proxy node "%s" is not enabled').format(i,o.proxy_node_v4)),o.proxy_node_v6&&e.has(o.proxy_node_v6)&&t.push(_('Route rule "%s" IPv6 proxy node "%s" is not enabled').format(i,o.proxy_node_v6))):o.proxy_node&&e.has(o.proxy_node)&&t.push(_('Route rule "%s" proxy node "%s" is not enabled').format(i,o.proxy_node)),o.dns_proxy_node&&e.has(o.dns_proxy_node)&&t.push(_('Route rule "%s" DNS exit node "%s" is not enabled').format(i,o.dns_proxy_node))}),w(_("Configuration contains disabled nodes"),t)}function ht(){let e=g.getProxySectionMap(),t=[];return e.forEach(n=>{if(n.enabled!=="1"||g.getProxyCore(n)===p.CUSTOM||n.type!==f.LOAD_BALANCE)return;let r=g.getProxyName(n),o=g.getProxyCore(n);o!==p.SING_BOX&&o!==p.XRAY&&t.push(_('Load balancing node "%s" has an unsupported backend core').format(r));let i=g.normalizeProxyNodeList(n.member_node);if(i.length===0){t.push(_('Load balancing node "%s" has no member nodes').format(r));return}let s=i.filter((l,c)=>i.indexOf(l)!==c);s.length>0&&t.push(_('Load balancing node "%s" contains duplicate member nodes: %s').format(r,Array.from(new Set(s)).join(", "))),i.forEach(l=>{if(l===r){t.push(_('Load balancing node "%s" cannot include itself').format(r));return}let c=e.get(l);if(!c){t.push(_('Load balancing node "%s" member node "%s" does not exist').format(r,l));return}g.getProxyCore(c)!==p.CUSTOM&&c.type===f.LOAD_BALANCE&&t.push(_('Load balancing node "%s" cannot contain load balancing member "%s"').format(r,l)),c.enabled!=="1"&&t.push(_('Load balancing node "%s" member node "%s" is not enabled').format(r,l)),g.isPort(c.socks_port)||t.push(_('Load balancing node "%s" member node "%s" has no valid SOCKS port configured').format(r,l))}),n.fallback_tag&&i.indexOf(n.fallback_tag)<0&&t.push(_('Load balancing node "%s" fallback node "%s" is not a member').format(r,n.fallback_tag))}),w(_("Configuration contains invalid load balancing nodes"),t)}function mt(){let e=g.getProxySectionMap(),t=[];e.forEach(r=>{if(r.enabled!=="1"||g.getProxyCore(r)===p.CUSTOM||r.type===f.LOAD_BALANCE||!r.upstream_proxy_node)return;let o=g.getProxyName(r),i=r.upstream_proxy_node,s=e.get(i);if(!s){t.push(_('Proxy node "%s" upstream proxy node "%s" does not exist').format(o,i));return}s.enabled!=="1"&&t.push(_('Proxy node "%s" upstream proxy node "%s" is not enabled').format(o,i)),g.isPort(s.socks_port)||t.push(_('Proxy node "%s" upstream proxy node "%s" has no valid SOCKS port configured').format(o,i));let l=g.collectProxyChain(o,e);!l.cycle&&l.chain.length>ee&&t.push(_('Proxy node "%s" nesting chain exceeds %d nodes: %s').format(o,ee,l.chain.join(" -> ")))});let n=g.findProxyDependencyCycle(e);return n&&t.push(_("Proxy node dependency chain has a cycle: %s").format(n.join(" -> "))),w(_("Configuration contains invalid upstream proxy nodes"),t)}function yt(){let e=new Set,t=new Set;a.sections("hijpass","shunt_dns_node",function(s){s.tag&&(e.add(s.tag),s.enabled==="0"&&t.add(s.tag))});let n=[],r=[];function o(s,l){if(s){if(!e.has(s)){n.push(_('%s "%s" does not exist').format(l,s));return}t.has(s)&&r.push(_('%s "%s" is not enabled').format(l,s))}}let i=a.get_first("hijpass","shunt","default_dns_node");return i?o(i,_("Default global DNS")):n.push(_("Default global DNS is not configured")),o(a.get_first("hijpass","shunt","ruleset_dns_node"),_("Rule-set DNS")),a.sections("hijpass","shunt_route_rule",function(s){s.enabled==="1"&&o(s.dns_node,_('Route rule "%s" DNS node').format(s.name||s[".name"]))}),w(_("Configuration contains missing DNS nodes"),n)&&w(_("Configuration contains disabled DNS nodes"),r)}function wt(){let e=new Set;a.sections("hijpass","proxy_node",function(o){o.name&&e.add(o.name)});let t=a.get_first("hijpass","shunt","type"),n=a.get_first("hijpass","shunt","ruleset_convert"),r=[];return N.getRouteSection().rules.forEach(function(o){if(o.enabled!=="1")return;let i=o.dnsProxyNode,s=o.name||_("Unnamed Rule");if(xt(o,t,n)&&!i){r.push(_('Route rule "%s" uses IPv4/IPv6 split and must specify a DNS exit node').format(s));return}i&&i!=="hijpass-direct"&&!e.has(i)&&r.push(_('Route rule "%s" DNS exit node "%s" does not exist').format(s,i))}),w(_("Configuration contains invalid DNS exit nodes"),r)}function xt(e,t,n){if(e.ipVersionSplit!=="1")return!1;let r=N.parseRuleList(e);return t===p.XRAY?r.containDomain()||r.geoSite.length>0:r.containDomain()||r.containRuleSet()||n==="1"&&r.geoSite.length>0}function bt(){let e=new Set;a.sections("hijpass","proxy_node",function(s){s.enabled==="1"&&s.listen_port&&e.add(s.listen_port)});let t=a.get_first("hijpass","firewall","proxy_port"),n=a.get_first("hijpass","firewall","shunt_port"),r=a.get_first("hijpass","shunt","enabled")!=="0",o=a.get_first("hijpass","shunt","shunt_listen_port"),i=[];return t&&!e.has(t)&&i.push(_("Firewall proxy port %s does not reference an enabled proxy node").format(t)),n&&!e.has(n)&&!(r&&o===n)&&i.push(_("Firewall shunt port %s does not reference an enabled proxy node or shunt service").format(n)),w(_("Configuration conflict"),i)}function Et(){let e=j.validateSource(j.getSource());return e===!0||w(_("Configuration conflict"),[e])}function Nt(){if(a.get_first("hijpass","dns","dns_service")!=="chinadns-ng")return!0;let t=j.getRoutingTarget(),n=t.port?"127.0.0.1#"+t.port:"",r=[];return[["direct_dns",_("Direct Domain DNS")],["proxy_dns",_("Proxy Domain DNS")]].forEach(([o,i])=>{let s=a.get_first("hijpass","dns",o);!s||s==="dnsmasq"||s==="system"||s==="custom"||(!t.available||s!==n)&&r.push(_("%s references an unavailable Core DNS port").format(i))}),w(_("Configuration conflict"),r)}function St(){if(a.get_first("hijpass","shunt","type")!==p.XRAY)return!0;let t=[];return a.sections("hijpass","shunt_route_rule",function(n){if(n.enabled!=="1")return;let r=dt(n.protocol).filter(o=>Se.indexOf(o)===-1);r.length>0&&t.push(_('Route rule "%s" contains protocols unsupported by Xray: %s').format(n.name||n[".name"],r.join(", ")))}),t.length>0?(U.warning(_("Unsupported Xray protocol configuration"),t.join(`
`)+`
`+_("Xray route protocol only supports: %s").format(Se.join(", ")),8e3),!1):!0}function vt(){if(a.get_first("hijpass","shunt","type")!==p.XRAY)return!0;let t=[];return a.sections("hijpass","shunt_dns_node",function(n){n.enabled!=="0"&&n.type==="tls"&&t.push(_('DNS node "%s" uses TLS, which is only supported by sing-box').format(n.tag||n[".name"]))}),w(_("Unsupported Xray DNS configuration"),t)}function Tt(){let e=[];return a.sections("hijpass","proxy_node",function(t){t.enabled!=="1"||H(t.core)!==p.XRAY||t.tls_insecure!=="1"||pt.indexOf(t.type)!==-1&&e.push(_('Proxy node "%s" enables insecure TLS, which is not supported by current Xray').format(t.name||t[".name"]))}),w(_("Unsupported Xray TLS configuration"),e)}function Ct(e,t,n){return new Promise(r=>{R.showModal(e,[E("div",{style:["box-sizing:border-box","width:100%","margin:0 0 14px 0","padding:14px 16px","border-radius:4px","background:rgba(127,127,127,0.08)","line-height:1.55"].join(";")},[E("div",{style:"margin:0 0 12px 0"},t),E("div",{style:"display:flex;flex-direction:column;gap:6px;margin:0"},n.map(o=>E("div",{style:"margin:0;word-break:break-word"},o)))]),E("div",{style:"display:flex;justify-content:flex-end;gap:10px;margin:0"},[E("button",{class:"btn cbi-button",click:function(o){o.preventDefault(),R.hideModal(),r(!1)}},_("Cancel")),E("button",{class:"btn cbi-button-action",click:function(o){o.preventDefault(),R.hideModal(),r(!0)}},_("Continue Apply"))])])})}function Ot(e,t,n){let r=N.parseRuleList(e),o=e.name||e[".name"]||_("Unnamed Rule"),i=n==="1";if(t===p.XRAY)return r.isEmpty("geo")?_('Route rule "%s" has no valid match conditions for Xray').format(o):r.containRuleSet()&&!r.containDomain()&&!r.containIp()&&!r.containGeo()?_('Route rule "%s" only contains rule-set target conditions unsupported by Xray').format(o):null;if(t===p.SING_BOX){if(!i&&r.containGeo()&&(r.geoSite=[],r.geoIp=[],!r.containDomain()&&!r.containIp()&&!r.containRuleSet()))return _('Route rule "%s" has no target conditions for sing-box after removing unconverted geosite/geoip').format(o);if(r.isEmpty("set")&&!(i&&r.containGeo()))return _('Route rule "%s" has no valid match conditions for sing-box').format(o)}return null}function Rt(){let e=a.get_first("hijpass","shunt","type"),t=a.get_first("hijpass","shunt","ruleset_convert"),n=[];return N.getRouteSection().rules.forEach(r=>{if(r.enabled!=="1")return;let o=Ot(r,e,t);o&&n.push(o)}),n.length>0?Ct(_("Some route rules will be skipped"),_("The following rules have no valid configuration for the current core and options, so they will not be written to the final configuration. Continue applying the configuration?"),n):!0}var ve={runSaveApplyPrechecks:async function(){return!mt()||!ht()||!Tt()||!bt()||!Et()||!Nt()?!1:gt()?ft()&&_t()&&yt()&&wt()&&await Rt()&&St()&&vt():!0}};function Pt(){return a.get_first("hijpass","hijpass","enabled")==="0"}var Te={genHandleSaveApply:function(){return async function(e,t){try{if(await this.handleSave(e),Pt()){await a.save(),await R.changes.apply(t=="0");return}if(!await ve.runSaveApplyPrechecks())return;let n=await y.writeConfigs(JSON.stringify(a.sections("hijpass",void 0)));n.shunt!==void 0&&a.set_first("hijpass","shunt","shunt_hash",String(I.simpleHash(n.shunt))),_e.updateGeoRules(),await a.save();let r=await a.changes();await ge.cleanupChangedNodeFiles(r),await R.changes.apply(t=="0")}catch(n){console.log(n),U.error(_("Configuration Apply Failed"),_(n.message),5e3)}}}};var Ce=poll;var oe=B.declare({object:"service",method:"list",params:["name"],expect:{"":{}}}),ie={};function Re(e){return e||"all"}function Oe(e){return"service_status_"+Re(e)}var S={getServiceInstances:async function(e){return(await oe(e))?.[e]?.instances??{}},getServiceInfo:async function(){let e=await oe("hijpass"),n=(await oe("hijserver"))?.hijserver?.instances??{},r=e?.hijpass?.instances??{};return{proxyInfos:S.getInstanceName("hijpass","proxy_node").map(o=>r?.[o]??void 0).filter(o=>o),shuntInfo:r?.[S.getInstanceName("hijpass","shunt")[0]]??void 0,dnsInfo:r?.[S.getInstanceName("hijpass","dns")[0]]??void 0,serverInfos:S.getInstanceName("hijserver","server_node").map(o=>n?.[o]??void 0).filter(o=>o)}},getInstanceName:function(e,t){return a.sections(e,t).map(n=>{let r=n[".name"],o=n.name??n.tag??n.dns_service;return o||(o=t),r+"-"+o})},renderServiceStatusText:function(e,t){let n="",r='<em><span style="color:%s"><strong>%s %s</strong></span></em>',o=(e?.proxyInfos??[]).filter(u=>u?.running).length>0,i=(e?.serverInfos??[]).filter(u=>u?.running).length>0,s=e?.shuntInfo?.running??!1,l=e?.dnsInfo?.running??!1,c=function(u,D){return D?r.format("green",u,_("Running")):r.format("red",u,_("Not Running"))};switch(t){case"dns":n+=c(_("Independent DNS"),l);break;case"shunt":n+=c(_("Proxy Routing"),s);break;case"server":n+=c(_("Local Server"),i);break;case"proxy":n+=c(_("Proxy Node"),o);break;default:n+=c(_("Proxy Node"),o),n+=c(_("Proxy Routing"),s),n+=c(_("Independent DNS"),l),n+=c(_("Local Server"),i)}return n},refreshServiceStatus:function(e){let t=Re(e);if(!ie[t]){let n=Oe(e);ie[t]=async function(){let r=await L.resolveDefault(S.getServiceInfo()),o=document.getElementById(n);o&&(o.innerHTML=S.renderServiceStatusText(r,e))}}return ie[t]},renderServiceStatus:function(e){return function(){let t=S.refreshServiceStatus(e);return Ce.add(t),window.setTimeout(t,0),E("div",{class:"hijpass-service-status"},E("fieldset",{class:"cbi-section"},[E("p",{id:Oe(e),style:"display: flex; gap: 1rem;"},_("Fetching Status..."))]))}},createStatusSection:function(e,t){let n=e.section(h.TypedSection);return n.anonymous=!0,n.render=S.renderServiceStatus(t),n}};var Ft=[{id:"baidu",name:"Baidu",url:"https://www.baidu.com",svg:'<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Baidu</title><path d="M8.859 11.735c1.017-1.71 4.059-3.083 6.202.286 1.579 2.284 4.284 4.397 4.284 4.397s2.027 1.601.73 4.684c-1.24 2.956-5.64 1.607-6.005 1.49l-.024-.009s-1.746-.568-3.776-.112c-2.026.458-3.773.286-3.773.286l-.045-.001c-.328-.01-2.38-.187-3.001-2.968-.675-3.028 2.365-4.687 2.592-4.968.226-.288 1.802-1.37 2.816-3.085zm.986 1.738v2.032h-1.64s-1.64.138-2.213 2.014c-.2 1.252.177 1.99.242 2.148.067.157.596 1.073 1.927 1.342h3.078v-7.514l-1.394-.022zm3.588 2.191l-1.44.024v3.956s.064.985 1.44 1.344h3.541v-5.3h-1.528v3.979h-1.46s-.466-.068-.553-.447v-3.556zM9.82 16.715v3.06H8.58s-.863-.045-1.126-1.049c-.136-.445.02-.959.088-1.16.063-.203.353-.671.951-.85H9.82zm9.525-9.036c2.086 0 2.646 2.06 2.646 2.742 0 .688.284 3.597-2.309 3.655-2.595.057-2.704-1.77-2.704-3.08 0-1.374.277-3.317 2.367-3.317zM4.24 6.08c1.523-.135 2.645 1.55 2.762 2.513.07.625.393 3.486-1.975 4-2.364.515-3.244-2.249-2.984-3.544 0 0 .28-2.797 2.197-2.969zm8.847-1.483c.14-1.31 1.69-3.316 2.931-3.028 1.236.285 2.367 1.944 2.137 3.37-.224 1.428-1.345 3.313-3.095 3.082-1.748-.226-2.143-1.823-1.973-3.424zM9.425 1c1.307 0 2.364 1.519 2.364 3.398 0 1.879-1.057 3.4-2.364 3.4s-2.367-1.521-2.367-3.4C7.058 2.518 8.118 1 9.425 1z" fill="#2932E1" fill-rule="nonzero"></path></svg>'},{id:"google",name:"Google",url:"https://www.google.com/ncr",svg:'<svg height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Google</title><path d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z" fill="#4285F4"></path><path d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z" fill="#34A853"></path><path d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z" fill="#FBBC05"></path><path d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z" fill="#EB4335"></path></svg>'},{id:"github",name:"GitHub",url:"https://github.com",svg:'<svg fill="currentColor" fill-rule="evenodd" height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Github</title><path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"></path></svg>'},{id:"bilibili",name:"Bilibili",url:"https://www.bilibili.com",svg:'<svg height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>bilibili</title><path clip-rule="evenodd" d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z" fill="#1b7be1" fill-rule="evenodd"></path></svg>'}];function At(e){C(e,_("Restarting Service"),"neutral"),y.restartService().then(function(t){t.code===0?(C(e,_("Service Restarted"),"success"),setTimeout(function(){location.reload()},2e3)):C(e,_("Service Restart Failed")+(t.stderr||t.stdout),"error")}).catch(function(t){C(e,_("Service Restart Failed")+t.message,"error")})}function Dt(e){C(e,_("Refreshing Firewall"),"neutral"),y.resetFirewall().then(function(t){t.code===0?C(e,_("Firewall Refreshed"),"success"):C(e,_("Firewall Refresh Failed")+(t.stderr||t.stdout),"error")}).catch(function(t){C(e,_("Firewall Refresh Failed")+t.message,"error")})}function C(e,t,n){e.textContent=t,e.style.color=n==="success"?"#4caf50":n==="error"?"#f44336":"#666"}function Lt(e){let t=E("div",{style:"font-size: 13px; color: #f44336;"},_("Click to Test")),n;return n=E("div",{class:"connectivity-btn cbi-section",style:"width: 100%; height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 15px; border-radius: 8px; padding: 0; box-shadow: 0 0 2rem 0 rgba(136, 152, 170, .15); border:1px solid rgba(0, 0, 0, .05); cursor: pointer;",click:function(){It(e.url,n,t)}},[E("div",{style:"display: flex; align-items: center; justify-content: center;"},[E("span",{style:"width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"},[E("raw",{},e.svg)])]),E("div",{style:"font-weight: bold; font-size: 16px; margin-bottom: 2px;"},_(e.name)),t]),E("div",{class:"connectivity-test-button",style:"flex: 1; min-width: 120px;"},[n])}function It(e,t,n){t.dataset.loading!=="1"&&(n.textContent=_("Testing"),n.style.color="#666",t.dataset.loading="1",t.style.opacity="0.7",y.connect(e,"5").then(r=>{Pe(t,n,r.success,r)}).catch(r=>{console.error(r),Pe(t,n,!1,void 0)}))}function Pe(e,t,n,r){delete e.dataset.loading,e.style.opacity="1",n?/^([45])\d{2}$/.test(r.http_code)?(t.textContent=_("Connection Abnormal")+r.http_code,t.style.color="#f44336"):(t.textContent=r.tls_handshake_time_ms+" ms",t.style.color="#4caf50"):(t.textContent=_("Test Failed"),t.style.color="#f44336")}var se={createActionButtons:function(){let e=E("span",{style:"margin-left: 10px; font-size: 12px; color: #666;"});return E("div",{class:"cbi-value",style:"margin-bottom: 2rem;"},[E("label",{class:"cbi-value-title",style:"visibility: hidden"},_("Service Control")),E("div",{class:"cbi-value-field"},[E("button",{class:"cbi-button cbi-button-action",style:"margin-right: 10px;",type:"button",click:function(t){t.preventDefault(),At(e)}},_("Restart Service")),E("button",{class:"cbi-button cbi-button-action",style:"margin-right: 10px;",type:"button",click:function(t){t.preventDefault(),Dt(e)}},_("Refresh Firewall")),e])])},createConnectivityTest:function(){return E("div",{id:"custom-connectivity-test",class:"cbi-map"},[E("h2",{},_("Website Connectivity Test")),E("div",{class:"cbi-section",style:"display: flex; gap: 18px; padding: 18px; justify-content: center;"},Ft.map(e=>Lt(e)))])}};function K(e){return a.get_first("hijpass",e)||{}}function q(e){return e?(Array.isArray(e)?e:[e]).filter(Boolean):[]}function O(e){let t=Number(e);return Number.isInteger(t)&&t>0&&t<=65535}function Fe(e){return e?e.replace("#",":"):_("Not configured")}function Mt(e){return e.acl_default_allow==="1"?_("Bypass mode"):_("Proxy mode")}function Le(e){return _("Firewall ACL")+" \xB7 "+Mt(e)}function ae(e){if(e.acl_default_allow==="1"){let r=q(e.proxy_mac_exclude_list).length,o=q(e.proxy_iface_exclude_list).length;return _("Excluded: %s devices, %s interfaces").format(String(r),String(o))}let t=q(e.proxy_mac_list).length,n=q(e.proxy_iface_list).length;return _("Selected: %s devices, %s interfaces").format(String(t),String(n))}function Ie(e,t){if(!O(e))return[{title:t,detail:_("No valid listen port"),tone:"warning",page:"firewall"}];let n=g.getProxySectionMap(),r=Array.from(n.values()).find(s=>s.enabled==="1"&&s.listen_port===e),o=[{title:t+": "+e,tone:"proxy",page:"firewall"}];if(!r)return o.push({title:_("Proxy node unavailable"),detail:_("No enabled node uses this port"),tone:"warning",page:"proxy"}),o;if(g.getProxyCore(r)!==p.CUSTOM&&r.type===f.LOAD_BALANCE){let s=g.normalizeProxyNodeList(r.member_node);return o.push({title:_("Load balancing: %s").format(r.name),page:"proxy",detail:s.length>0?_("Members: %s").format(s.join(", ")):_("No member nodes"),tone:s.length>0?"proxy":"warning"}),o}o.push({title:_("Proxy node: %s").format(r.name),page:"proxy",detail:g.getProxyCore(r),tone:"proxy"});let i=g.collectProxyChain(r.name,n);return i.chain.slice(1).forEach(s=>{let l=n.get(s);o.push({title:_("Upstream proxy: %s").format(s),page:"proxy",detail:l?.socks_port?_("SOCKS port %s").format(l.socks_port):_("Node unavailable"),tone:l?"proxy":"warning"})}),i.cycle&&o.push({title:_("Proxy dependency cycle"),tone:"warning",page:"proxy"}),o}function le(e,t){let n=t==="dns"?e.dns_listen_port:e.shunt_listen_port,r=t==="dns"?_("Core DNS"):_("Default shunt port");if(e.enabled==="0"||!O(n))return[{title:r,detail:_("Disabled or invalid listen port"),tone:"warning",page:"shunt"}];if(t==="traffic")return[{title:r+": "+n,tone:"proxy",page:"firewall"},{title:_("Default shunt"),detail:e.type==="xray"?"Xray":e.type||"",tone:"proxy",page:"shunt"}];let o=[{title:r+": "+n,page:"shunt",detail:e.type==="xray"?"Xray":e.type||"",tone:"proxy"}];if(e.config_type==="custom")return o.push({title:_("Custom core configuration"),detail:_("Internal path cannot be expanded"),tone:"muted",page:"shunt"}),o;let s=a.sections("hijpass","shunt_route_rule").filter(l=>l.enabled==="1").filter(l=>!!l.dns_node);return o.push({title:_("DNS routing rules"),page:"shunt",detail:_("%s enabled rules, default DNS: %s").format(String(s.length),e.default_dns_node||_("Not configured")),tone:"normal"}),o}function Ae(e,t,n){if(e==="custom")return[{title:_("Custom DNS"),detail:Fe(t),tone:"normal",page:"dns"}];if(e==="dnsmasq"||e==="system"){let o=a.get_first("dhcp","dnsmasq","port")||"53";return[{title:"dnsmasq",detail:_("Local port %s").format(o),tone:"direct",page:"dhcp"}]}let r=n.dns_listen_port||"";return e===x.ROUTING||e==="127.0.0.1#"+r?le(n,"dns"):[{title:_("DNS upstream"),detail:Fe(e),tone:"normal",page:"dns"}]}function jt(e,t,n,r){let o=j.getSource(),i=o===x.NONE?ae(t):[ae(t),t.proxy_local==="1"?_("Router traffic included"):_("Router traffic excluded")].join(`
`),s=[{title:_("Client DNS query"),detail:_("TCP/UDP port 53")},{title:Le(t),detail:i,page:"firewall"}];if(o===x.NONE)return s.push({title:_("No DNS redirect"),detail:_("Keep the original destination"),tone:"muted",page:"firewall"}),{id:"dns",title:_("DNS flow"),steps:s};if(o===x.ROUTING)return s.push(...le(r,"dns")),{id:"dns",title:_("DNS flow"),steps:s};if(o!==x.PRE_ROUTING)return s.push({title:_("Unknown DNS forwarding source"),detail:o,tone:"warning"}),{id:"dns",title:_("DNS flow"),steps:s};if(n.dns_service!=="chinadns-ng"||!O(n.cdg_port))return s.push({title:_("Independent DNS unavailable"),detail:_("Disabled or invalid listen port"),tone:"warning",page:"dns"}),{id:"dns",title:_("DNS flow"),steps:s};s.push({title:_("Independent DNS: %s").format(n.cdg_port),detail:"chinadns-ng",tone:"proxy",page:"dns"});let l=[],c=[];return e.domain_direct&&l.push(_("Custom direct domain list")),e.domain_proxy&&c.push(_("Custom proxy domain list")),n.use_chn==="1"&&l.push(_("CHN domain list")),n.use_gfw==="1"&&c.push(_("GFW domain list")),{id:"dns",title:_("DNS flow"),steps:s,branches:[{condition:_("Direct domain branch"),page:"dns",detail:l.join(" + ")||void 0,steps:Ae(n.direct_dns,n.direct_dns_custom,r)},{condition:_("Proxy domain branch"),page:"dns",detail:c.join(" + ")||void 0,steps:Ae(n.proxy_dns,n.proxy_dns_custom,r)}]}}function Me(e,t){let n=e.shunt_port||"";return O(n)?n===t.shunt_listen_port?le(t,"traffic"):Ie(n,_("Default shunt port")):[{title:_("Direct"),detail:_("Default shunt port is disabled"),tone:"direct",page:"firewall"}]}function De(e,t){return O(e.proxy_port)?Ie(e.proxy_port,_("Proxy port")):O(e.shunt_port)?Me(e,t):[{title:_("No proxy target"),tone:"warning",page:"firewall"}]}function Ut(e,t,n,r){let o=(t.tproxy_proto||"").split(",").filter(Boolean).map(D=>D.toUpperCase()),i={title:_("Client traffic"),page:"firewall",detail:o.join(" + ")||_("No protocol selected")},s={title:Le(t),page:"firewall",detail:[ae(t),t.proxy_local==="1"?_("Router traffic included"):_("Router traffic excluded")].join(`
`)},l=O(t.proxy_port),c=O(t.shunt_port);if(!l&&!c)return{id:"traffic",title:_("Traffic flow"),steps:[i,s,{title:_("No proxy target"),tone:"warning",page:"firewall"}]};let u=[];return(e.ip_proxy||n.dns_service==="chinadns-ng"&&e.domain_proxy)&&u.push({condition:_("Forced proxy address"),page:"firewall",steps:De(t,r)}),(e.ip_direct||n.dns_service==="chinadns-ng"&&e.domain_direct)&&u.push({condition:_("Forced direct address"),page:"firewall",steps:[{title:_("Direct"),tone:"direct"}]}),n.dns_service==="chinadns-ng"&&n.use_gfw==="1"&&u.push({condition:_("GFW domain set"),page:"dns",steps:De(t,r)}),c&&n.dns_service==="chinadns-ng"&&n.use_chn==="1"&&u.push({condition:_("CHN domain set"),page:"dns",steps:[{title:_("Direct"),tone:"direct"}]}),c&&t.use_chnroute==="1"&&u.push({condition:_("CHN route set"),page:"firewall",steps:[{title:_("Direct"),tone:"direct"}]}),u.push({condition:_("No address rule matched"),steps:Me(t,r)}),{id:"traffic",title:_("Traffic flow"),steps:[i,s],branches:u,branchMode:"ordered",branchDescription:_("Address rules are evaluated from top to bottom")}}function je(){let e=K("hijpass"),t=K("firewall"),n=K("dns"),r=K("shunt");return{diagrams:[jt(e,t,n,r),Ut(e,t,n,r)]}}var kt=`
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

`;function Yt(){if(document.getElementById("hijpass-flow-preview-styles"))return;let e=document.createElement("style");e.id="hijpass-flow-preview-styles",e.textContent=kt,document.head.appendChild(e)}function ce(e){return L.url(e==="dhcp"?"admin/network/dhcp":"admin/services/hijpass/"+e)}function Ht(e){return E(e.page?"a":"div",{...e.page?{href:ce(e.page)}:{},class:"hijpass-flow-step","data-tone":e.tone||"normal"},[E("strong",{},e.title),e.detail?E("span",{class:"hijpass-flow-step__detail"},e.detail):""])}function J(e){let t=[];return e.forEach((n,r)=>{t.push(E("li",{},[Ht(n)])),r<e.length-1&&t.push(E("li",{class:"hijpass-flow-arrow","aria-hidden":"true"},"\u2192"))}),E("ol",{class:"hijpass-flow-chain"},t)}function Bt(e){return E("li",{class:"hijpass-flow-branch hijpass-flow-branch--parallel"},[E("span",{class:"hijpass-flow-branch__joint","aria-hidden":"true"},"\u2192"),E(e.page?"a":"div",{class:"hijpass-flow-branch__condition",...e.page?{href:ce(e.page)}:{}},[E("strong",{},e.condition),e.detail?E("span",{class:"hijpass-flow-branch__detail"},e.detail):""]),E("span",{class:"hijpass-flow-arrow","aria-hidden":"true"},"\u2192"),J(e.steps)])}function Ue(e){return E("li",{class:"hijpass-flow-branch hijpass-flow-branch--ordered"},[E(e.page?"a":"div",{class:"hijpass-flow-branch__condition",...e.page?{href:ce(e.page)}:{}},[E("strong",{},e.condition),e.detail?E("span",{class:"hijpass-flow-branch__detail"},e.detail):""]),E("span",{class:"hijpass-flow-arrow","aria-hidden":"true"},"\u2192"),J(e.steps)])}function Xt(e,t,n){let r=[];return t.slice(1).forEach(o=>{r.push(E("li",{class:"hijpass-flow-order-arrow","aria-hidden":"true"},"\u2193")),r.push(Ue(o))}),E("div",{class:"hijpass-flow-tree hijpass-flow-ordered","data-branch-mode":"ordered"},[E("p",{class:"hijpass-flow-ordered__description"},n||""),E("div",{class:"hijpass-flow-ordered__prefix"},J(e)),E("span",{class:"hijpass-flow-arrow hijpass-flow-ordered__entry","aria-hidden":"true"},"\u2192"),E("ol",{class:"hijpass-flow-branches hijpass-flow-branches--ordered hijpass-flow-ordered__first"},[Ue(t[0])]),r.length>0?E("ol",{class:"hijpass-flow-branches hijpass-flow-branches--ordered hijpass-flow-ordered__rest"},r):""])}function Gt(e){return e.branches?.length?E("ul",{class:"hijpass-flow-branches hijpass-flow-branches--parallel"},e.branches.map(Bt)):""}function Vt(e){let t=e.branchMode==="ordered"&&e.branches?.length?Xt(e.steps,e.branches,e.branchDescription):E("div",{class:"hijpass-flow-tree","data-branch-mode":e.branchMode||"parallel"},[J(e.steps),Gt(e)]);return E("div",{class:"hijpass-flow-scroll",role:"region","aria-label":e.title,tabindex:"0"},[t])}var ke={createConfigurationFlowPreview:function(){Yt();let e=je();return E("div",{class:"hijpass-flow-preview"},[E("div",{class:"cbi-section-descr"},_("Generated from saved settings. Branches show configured decisions, not a live packet trace.")),E("div",{class:"hijpass-flow-list"},e.diagrams.map(t=>E("section",{class:"hijpass-flow-card","aria-labelledby":"hijpass-flow-"+t.id},[E("h3",{id:"hijpass-flow-"+t.id},t.title),Vt(t)])))])}};var zt=de.extend({load:function(){return Promise.all([a.load("hijpass"),a.load("hijserver"),a.load("dhcp")])},handleSaveApply:Te.genHandleSaveApply(),render:async function(){let e=new h.Map("hijpass",_("HiJpass"));S.createStatusSection(e);let t=e.section(h.TypedSection,"hijpass");t.anonymous=!0,t.addremove=!1,t.tab("configuration",_("Configuration")),t.tab("flow",_("Flow preview"));let n=t.taboption("configuration",h.Flag,"enabled",_("Enable"),_("Enable or Disable HiJpass"));n.default="0",n.rmempty=!1;let r=t.taboption("configuration",h.Value,"delay_time",_("Delay Time"),_("Startup Delay"));r.datatype="uinteger",r.default="60",r.rmempty=!1;let o=t.taboption("configuration",h.ListValue,"log_level",_("Log Level"),_("Service Log Level"));o.modalonly=!0,o.value("DEBUG",_("Debug")),o.value("INFO",_("Info")),o.value("WARN",_("Warning")),o.value("ERROR",_("Error")),o.default="INFO",o.rmempty=!1;let i=t.taboption("configuration",h.Button,"_preview");i.render=function(){return se.createActionButtons()};let s=t.taboption("flow",h.DummyValue,"_flow_preview");s.render=ke.createConfigurationFlowPreview;let l=e.section(h.TypedSection,"connectivity_test_section");return l.anonymous=!0,l.addremove=!1,l.render=se.createConnectivityTest,e.render()}}),Wt=zt;return Ve(Kt);})();


return LuciView.default;
