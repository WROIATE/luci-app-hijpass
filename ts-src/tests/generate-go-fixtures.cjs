// Frozen output oracle from the last browser-generator revision.
const path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const baseline='bca34e5285fd8edd7da6cb2fd23e499e68c9f502';
const esbuild=require(root+'/ts-src/node_modules/esbuild');
const vm=require('vm'),fs=require('fs');
const source=fs.mkdtempSync(path.join(os.tmpdir(),'hijpass-oracle-'));
process.on('exit',()=>fs.rmSync(source,{recursive:true,force:true}));
execFileSync('tar',['-xf','-','-C',source],{input:execFileSync('git',['archive',baseline,'ts-src'],{cwd:root,maxBuffer:16*1024*1024})});
const built=esbuild.buildSync({stdin:{contents:`export { CoreAdapterFactory, LuciConverterFactory } from './core/adapter'; export { ProxyUtils } from './utils/feature/proxy/section'; export { JsonUtils } from './utils/base/files/json';`,resolveDir:source+'/ts-src',loader:'ts'},bundle:true,format:'cjs',platform:'node',external:['uci'],write:false,target:'es2022'}).outputFiles[0].text;
let sections=[];
const uci={sections:(_,type,cb)=>{let s=sections.filter(s=>!type||s['.type']===type);if(cb)s.forEach(cb);return s},get_first:(_,type,key)=>{const s=sections.find(s=>s['.type']===type);return key?s?.[key]:s}};
const ctx=vm.createContext({exports:{},module:{exports:{}},require:()=>uci,structuredClone});
vm.runInContext(`function _(s){return s};String.prototype.format=function(...a){let i=0;return this.replace(/%s/g,()=>a[i++])};`+built,ctx);
const {CoreAdapterFactory,LuciConverterFactory,ProxyUtils,JsonUtils}=ctx.module.exports;
const global={'.name':'global','.type':'hijpass',enabled:'1'};
const base={'.name':'node','.type':'proxy_node',name:'node',enabled:'1',listen_port:'11001',socks_port:'12001',server:'example.org',server_port:'443',password:'test-password',uuid:'11111111-1111-4111-8111-111111111111',method:'aes-128-gcm'};
const samples=[];
function add(name,config){sections=config;const nodes={};for(const s of uci.sections('','proxy_node'))if(s.enabled==='1'&&s.type!=='custom'&&s.core!=='custom'){const p=ProxyUtils.createProxyConfigFromSection(s);nodes[s['.name']]=LuciConverterFactory.genProxyConf(p.core,p)}const shunt=uci.get_first('','shunt');let out={nodes,shunt:shunt&&shunt.enabled!=='0'&&shunt.config_type==='tmpl'?CoreAdapterFactory.getCoreAdapter(shunt.type).genShuntConf():{}};out=JSON.parse(JSON.stringify(out,JsonUtils.omitEmptyReplacer));samples.push({name,sections:config,expected:out})}
for(const core of ['sing-box','xray']){
 for(const type of core==='xray'?['shadowsocks','hysteria2','vless']:['shadowsocks','hysteria2','vless','tuic','shadowtls']){
  add(`${core}-${type}-defaults`,[global,{...base,core,type}]);
  add(`${core}-${type}-options`,[global,{...base,core,type,tls_server_name:'tls.example.org',tls_insecure:'1',network:'udp',up_mbps:'20',down_mbps:'0',udp_idle_timeout:'30',server_ports:['443','1000-2000'],hop_interval:'30s',obfs_type:'salamander',obfs_password:'test-obfs',version:'3',congestion_control:'bbr',udp_relay_mode:'quic',udp_over_stream:'1',zero_rtt_handshake:'1',heartbeat:'5s',udp_over_tcp:'1',plugin:'obfs-local',plugin_opts:'obfs=http',multiplex_enabled:'1',multiplex_max_connections:'4',multiplex_min_streams:'2',multiplex_max_streams:'8',multiplex_brutal_enabled:'1',multiplex_brutal_up_mbps:'30',multiplex_brutal_down_mbps:'60',packet_encoding:'xudp',flow:'xtls-rprx-vision',tls_reality_enabled:'1',tls_reality_public_key:'test-public-key',tls_reality_short_id:'12345678'}]);
 }
 for(const transport of core==='xray'?['http','ws','grpc','httpupgrade','xhttp']:['http','ws','grpc','httpupgrade'])add(`${core}-vless-${transport}`,[global,{...base,core,type:'vless',transport_type:transport,transport_http_host:'host.example.org',transport_http_path:'/http',transport_http_method:'POST',transport_ws_host:'ws.example.org',transport_ws_path:'/ws?test=1#frag',transport_ws_max_early_data:'1024',transport_ws_early_data_header_name:'Sec-WebSocket-Protocol',transport_grpc_service_name:'service',transport_grpc_permit_without_stream:'1',transport_httpupgrade_host:'upgrade.example.org',transport_httpupgrade_path:'/upgrade',transport_xhttp_host:'xhttp.example.org',transport_xhttp_path:'/xhttp',transport_xhttp_mode:'packet-up'}]);
 const member={...base,'.name':'member',name:'member',core,type:'shadowsocks'};
 const lb={'.name':'lb','.type':'proxy_node',name:'lb',enabled:'1',core,type:'load_balance',listen_port:'11002',socks_port:'12002',member_node:['member']};
 add(`${core}-load-balance`,[global,member,lb]);
 add(`${core}-load-balance-options`,[global,member,{...lb,url:'https://example.org/204',interval:'1m',tolerance:'100',idle_timeout:'10m',interrupt_exist_connections:'1',strategy:'leastLoad',strategy_expected:'2',strategy_max_rtt:'2s',strategy_tolerance:'0.1',probe_url:'https://example.org/probe',probe_connectivity:'https://example.org/check',probe_interval:'2m',probe_timeout:'3s',probe_sampling:'5',probe_http_method:'HEAD'}]);
 add(`${core}-chain`,[global,member,{...base,'.name':'downstream',name:'downstream',core,type:'vless',listen_port:'11003',socks_port:'12003',upstream_proxy_node:'member'}]);
 const shunt={'.name':'shunt','.type':'shunt',type:core,config_type:'tmpl',shunt_listen_port:'18081',dns_listen_port:'10153',log_level:'warn',default_proxy_node:'hijpass-direct',default_dns_node:'dns',default_strategy:'64',use_cache:'1',ruleset_convert:'0'};
 const dns={'.name':'dns','.type':'shunt_dns_node',tag:'dns',type:'https',server:'1.1.1.1'};
 const rule={'.name':'rule','.type':'shunt_route_rule',name:'rule',enabled:'1',proxy_node:'member',dns_strategy:'4',domain_list:'full:example.org\ndomain:example.net\nkeyword\nregexp:.*test.*',ip_list:'1.2.3.4/32\n2001:db8::/32',protocol:['tls'],network:['tcp'],port:['443'],port_range:['8000-9000']};
 add(`${core}-shunt-default`,[global,shunt,dns]);
 add(`${core}-shunt-rules`,[global,member,shunt,dns,rule]);
 add(`${core}-shunt-split`,[global,member,shunt,dns,{...rule,ip_version_split:'1',proxy_node_v4:'member',proxy_node_v6:'hijpass-direct',dns_proxy_node:'member'}]);
 add(`${core}-shunt-block`,[global,member,shunt,dns,{...rule,proxy_node:'hijpass-block'}]);
 add(`${core}-shunt-geo`,[global,member,{...shunt,ruleset_convert:'1',ruleset_out_node:'member',ruleset_dns_node:'dns'},dns,{...rule,domain_list:'geosite:cn\nfull:example.org',ip_list:'geoip:cn'}]);
 add(`${core}-shunt-rulesets`,[global,member,{...shunt,ruleset_out_node:'member',ruleset_dns_node:'dns'},dns,{...rule,domain_list:'rule-set:remote:https://example.org/test.srs\nrule-set:local:/etc/hijpass/test.json'}]);
 for(const type of ['tcp','udp','quic'])add(`${core}-dns-${type}`,[global,{...shunt,use_cache:'0',default_strategy:'6'},{...dns,type,port:'5353'}]);
}
fs.mkdirSync(root+'/go-src/generator/testdata',{recursive:true});
fs.writeFileSync(root+'/go-src/generator/testdata/compatibility.json',JSON.stringify(samples,null,2)+'\n');
console.log(samples.length+' fixtures');
