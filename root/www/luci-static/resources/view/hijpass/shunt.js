
'use strict';
'require ui';
'require form';
'require view';
'require uci';
'require rpc';
'require poll';
'require fs';

var LuciView = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // views/shunt.ts
  var shunt_exports = {};
  __export(shunt_exports, {
    default: () => shunt_default
  });

  // enum/hijpass.ts
  var HijpassValues = {
    DNS_STRATEGY_VALUES: ["64", "46", "6", "4"],
    SING_BOX_LOG_LEVELS: ["info", "warn", "error", "debug"],
    SHUNT_CONF_TYPE: ["xray", "sing-box"]
  };

  // module/luci.ts
  var DnsNode = class {
    constructor() {
      __publicField(this, "tag");
      __publicField(this, "type");
      __publicField(this, "server");
      __publicField(this, "port");
    }
  };
  var DnsSection = class {
    constructor() {
      __publicField(this, "defaultDnsNode");
      __publicField(this, "defaultStrategy");
      __publicField(this, "useCache");
      __publicField(this, "nodes");
      this.nodes = [];
    }
  };
  var ShuntRouteRule = class {
    constructor() {
      __publicField(this, "enabled");
      __publicField(this, "name");
      __publicField(this, "proxyNode");
      __publicField(this, "protocol");
      __publicField(this, "network");
      __publicField(this, "port");
      __publicField(this, "portRange");
      __publicField(this, "domainList");
      __publicField(this, "ipList");
      __publicField(this, "dnsNode");
      __publicField(this, "dnsProxyNode");
      __publicField(this, "dnsStrategy");
      this.port = [];
      this.portRange = [];
      this.network = [];
      this.protocol = [];
    }
  };
  var RouteSection = class {
    constructor() {
      __publicField(this, "defaultProxyNode");
      __publicField(this, "rules");
      this.rules = [];
    }
  };
  var LoadBalanceNode = class {
    constructor() {
      __publicField(this, "tag");
      __publicField(this, "lbNodeList");
      __publicField(this, "url");
      __publicField(this, "interval");
      __publicField(this, "timeout");
      this.lbNodeList = [];
    }
  };
  var ShuntSection = class {
    constructor() {
      __publicField(this, "type");
      __publicField(this, "configType");
      __publicField(this, "shuntListenPort");
      __publicField(this, "dnsListenPort");
      __publicField(this, "logLevel");
      __publicField(this, "logPath");
      __publicField(this, "route");
      __publicField(this, "dns");
      __publicField(this, "loadBalance");
    }
  };
  var RuleDTO = class {
    constructor() {
      __publicField(this, "domain");
      __publicField(this, "domainRegex");
      __publicField(this, "domainKeyword");
      __publicField(this, "domainSuffix");
      __publicField(this, "ipCidr");
      __publicField(this, "network");
      __publicField(this, "protocol");
      __publicField(this, "port");
      __publicField(this, "portRange");
      __publicField(this, "ruleSet");
      // 规则集合
      __publicField(this, "geoIp");
      __publicField(this, "geoSite");
      this.domain = [];
      this.domainRegex = [];
      this.domainKeyword = [];
      this.domainSuffix = [];
      this.ruleSet = [];
      this.ipCidr = [];
      this.geoIp = [];
      this.geoSite = [];
      this.network = [];
    }
    containDomain() {
      return this.domain.length > 0 || this.domainRegex.length > 0 || this.domainRegex.length > 0 || this.domainKeyword.length > 0;
    }
    containGeo() {
      return this.geoSite.length > 0 || this.geoIp.length > 0;
    }
    containRuleSet() {
      return this.ruleSet.length > 0;
    }
    containIp() {
      return this.ipCidr.length > 0 || this.geoIp.length > 0;
    }
    isEmpty(collectionType) {
      return !(this.containDomain() || this.containIp() || collectionType === "geo" && this.containGeo() || collectionType === "set" && this.containRuleSet() || this.network.length > 0 || this.port.length > 0 || this.portRange.length > 0 || this.protocol.length > 0);
    }
  };

  // luci-virtual:rpc
  var rpc_default = rpc;

  // luci-virtual:poll
  var poll_default = poll;

  // luci-virtual:uci
  var uci_default = uci;

  // luci-virtual:fs
  var fs_default = fs;

  // luci-virtual:form
  var form_default = form;

  // luci-virtual:ui
  var ui_default = ui;

  // module/singbox.ts
  var Log = class {
    constructor(logLevel) {
      __publicField(this, "disabled");
      __publicField(this, "level");
      __publicField(this, "timestamp");
      this.disabled = false;
      this.level = logLevel || "info" /* DEFAULT_LOG_LEVEL */;
      this.timestamp = true;
    }
  };
  var DnsServer = class {
    constructor(type, tag, server, port, detour) {
      __publicField(this, "type");
      __publicField(this, "tag");
      __publicField(this, "server");
      __publicField(this, "port");
      __publicField(this, "detour");
      this.type = type;
      this.tag = tag;
      this.server = server;
      this.port = port;
      if (detour === "direct-out" /* DIRECT_OUTBOUND_TAG */) {
        this.detour = void 0;
      } else {
        this.detour = detour;
      }
    }
  };
  var DNS = class {
    constructor(defaultTag, defaultStrategy, cache) {
      __publicField(this, "servers");
      __publicField(this, "rules");
      __publicField(this, "strategy");
      __publicField(this, "disable_cache");
      __publicField(this, "disable_expire");
      __publicField(this, "final");
      this.servers = [];
      this.rules = [];
      this.strategy = defaultStrategy || "prefer_ipv6" /* DEFAULT_DNS_STRATEGY */;
      this.disable_cache = cache;
      this.disable_expire = cache;
      this.final = defaultTag;
    }
  };
  var Rule = class {
    constructor(action, outbound) {
      __publicField(this, "action");
      __publicField(this, "outbound");
      this.action = action;
      this.outbound = outbound;
    }
  };
  var RouteRule = class extends Rule {
    constructor(action, outbound) {
      super(action, outbound);
      __publicField(this, "protocol");
      __publicField(this, "port");
      __publicField(this, "port_range");
      __publicField(this, "domain");
      __publicField(this, "domain_suffix");
      __publicField(this, "domain_keyword");
      __publicField(this, "domain_regex");
      __publicField(this, "rule_set");
      __publicField(this, "ip_cidr");
      __publicField(this, "network");
    }
    initRule(rule) {
      this.network = rule.network;
      this.protocol = rule.protocol;
      this.port = rule.port;
      this.port_range = rule.portRange.map((range) => range.replace("-", ":"));
      this.domain = rule.domain;
      this.domain_suffix = rule.domainSuffix;
      this.domain_keyword = rule.domainKeyword;
      this.domain_regex = rule.domainRegex;
      this.rule_set = rule.ruleSet.map((r) => r.tag);
      this.ip_cidr = rule.ipCidr;
      return this;
    }
  };
  var DnsRule = class extends Rule {
    constructor(action, server, strategy) {
      super(action, void 0);
      __publicField(this, "domain");
      __publicField(this, "domain_keyword");
      __publicField(this, "domain_regex");
      __publicField(this, "domain_suffix");
      __publicField(this, "rule_set");
      __publicField(this, "server");
      __publicField(this, "strategy");
      __publicField(this, "disable_cache");
      __publicField(this, "disable_expire");
      this.action = action;
      this.server = server;
      this.strategy = strategy;
      this.disable_cache = true;
    }
    initRule(rule) {
      this.domain = rule.domain;
      this.domain_suffix = rule.domainSuffix;
      this.domain_keyword = rule.domainKeyword;
      this.domain_regex = rule.domainRegex;
      this.rule_set = rule.ruleSet.map((r) => r.tag);
      return this;
    }
  };
  var SniffRule = class extends RouteRule {
    constructor() {
      super("sniff", void 0);
    }
  };
  var HijackDnsRule = class extends RouteRule {
    constructor() {
      super("hijack-dns", void 0);
      this.protocol = ["dns"];
    }
  };
  var RuleSet = class {
    constructor(tag, type, format) {
      __publicField(this, "type");
      __publicField(this, "tag");
      __publicField(this, "format");
      this.type = type;
      this.tag = tag;
      this.format = format;
    }
  };
  var RemoteRuleSet = class extends RuleSet {
    constructor(tag, format, url, download_detour, update_interval) {
      super(tag, "remote", format);
      __publicField(this, "url");
      __publicField(this, "download_detour");
      __publicField(this, "update_interval");
      this.url = url;
      this.download_detour = download_detour;
      this.update_interval = update_interval;
    }
  };
  var LocalRuleSet = class extends RuleSet {
    constructor(tag, format, path) {
      super(tag, "local", format);
      __publicField(this, "path");
      this.path = path;
    }
  };
  var Route = class {
    constructor(defaultProxyTag, resolver) {
      __publicField(this, "rules");
      __publicField(this, "rule_set");
      __publicField(this, "default_domain_resolver");
      __publicField(this, "final");
      this.rules = [
        new SniffRule(),
        new HijackDnsRule()
      ];
      this.rule_set = [];
      this.default_domain_resolver = resolver;
      this.final = defaultProxyTag;
    }
  };
  var Outbound = class {
    constructor(type, tag) {
      __publicField(this, "type");
      __publicField(this, "tag");
      this.type = type;
      this.tag = tag;
    }
  };
  var BlockOutbound = class extends Outbound {
    constructor(tag) {
      super("block", tag);
    }
  };
  var DirectOutbound = class extends Outbound {
    constructor(tag) {
      super("direct", tag);
    }
  };
  var Socks = class extends Outbound {
    constructor(server, server_port, tag) {
      super("socks", tag);
      __publicField(this, "server");
      __publicField(this, "server_port");
      __publicField(this, "version");
      this.server = server;
      this.server_port = server_port;
      this.version = "5";
    }
  };
  var URLTest = class extends Outbound {
    constructor(tag, url, interval, tolerance, idle_timeout, interrupt_exist_connections) {
      super("urltest", tag);
      __publicField(this, "url");
      __publicField(this, "interval");
      __publicField(this, "tolerance");
      __publicField(this, "idle_timeout");
      __publicField(this, "interrupt_exist_connections");
      __publicField(this, "outbounds");
      this.outbounds = [];
      this.url = url;
      this.interval = interval;
      this.tolerance = tolerance;
      this.idle_timeout = idle_timeout;
      this.interrupt_exist_connections = interrupt_exist_connections;
    }
  };
  var Inbound = class {
    constructor(type, port, tag) {
      __publicField(this, "type");
      __publicField(this, "tag");
      __publicField(this, "listen");
      __publicField(this, "listen_port");
      this.type = type;
      this.tag = tag;
      this.listen = "::";
      this.listen_port = port;
    }
  };
  var TproxyInbound = class extends Inbound {
    constructor(port, tag) {
      super("tproxy", port, tag);
    }
  };
  var DnsInbound = class extends Inbound {
    constructor(port, tag) {
      super("direct", port, tag);
    }
  };

  // utils/singbox.ts
  var SingBoxUtils = {
    genShuntConf: genConf
  };
  function genConf() {
    let shuntSection = ShuntUtils.getShuntSection();
    if (!shuntSection) {
      return;
    }
    let dnsServerMap = /* @__PURE__ */ new Map();
    let ruleSetMap = /* @__PURE__ */ new Map();
    let dnsConf = shuntSection.dns;
    let routeConf = shuntSection.route;
    let route = new Route(transOutTag(routeConf.defaultProxyNode), dnsConf.defaultDnsNode);
    let dns = new DNS(
      dnsConf.defaultDnsNode,
      transDnsStrategy(dnsConf.defaultStrategy),
      dnsConf.useCache === "1"
    );
    dnsConf.nodes.forEach(function(dnsNode) {
      let server = new DnsServer(
        dnsNode.type,
        dnsNode.tag,
        dnsNode.server,
        parseInt(dnsNode.port, 10),
        void 0
      );
      dnsServerMap.set(dnsNode.tag, server);
    });
    let outbounds = [
      new DirectOutbound("direct-out" /* DIRECT_OUTBOUND_TAG */),
      new BlockOutbound("block" /* BLOCK_OUTBOUND_TAG */)
    ];
    uci_default.sections("hijpass" /* CONF_NAME */, "proxy_node" /* PROXY_NODE_TYPE */, function(section) {
      if (section.enabled === "1") {
        let proxyNode = new Socks("127.0.0.1", parseInt(section.socks_port, 10), section.name);
        outbounds.push(proxyNode);
      }
    });
    if (shuntSection.loadBalance) {
      let lbConf = shuntSection.loadBalance;
      let testNode = new URLTest(
        "slb" /* LOAD_BALANCE_OUTBOUND_TAG */,
        lbConf.url,
        parseInt(lbConf.interval, 10),
        parseInt(lbConf.timeout, 10),
        void 0,
        void 0
      );
      testNode.outbounds = lbConf.lbNodeList;
      outbounds.push(testNode);
    }
    let inbounds = [
      new TproxyInbound(parseInt(shuntSection.shuntListenPort, 10), "tproxy-in" /* TPORXY_INBOUND_TAG */),
      new DnsInbound(parseInt(shuntSection.dnsListenPort, 10), "dns-in" /* DNS_INBOUND_TAG */)
    ];
    if (route.default_domain_resolver && route.final) {
      let dnsTmpl = dnsServerMap.get(route.default_domain_resolver);
      let server = genDnsFromTmpl(dnsTmpl.tag, route.final, dnsTmpl);
      dns.servers.push(server);
    }
    routeConf.rules.forEach(function(routeRule) {
      if (routeRule.enabled !== "1") {
        return;
      }
      let luciRuleDTO = ShuntUtils.parseRuleList(routeRule);
      if (luciRuleDTO.isEmpty("set")) {
        return;
      }
      for (let rs of luciRuleDTO.ruleSet) {
        ruleSetMap.set(rs.tag, genRuleSet(rs));
      }
      let action = "route";
      let outbound = transOutTag(routeRule.proxyNode);
      if (routeRule.proxyNode === "hijpass-block" /* BLOCK_OUTBOUND_TAG */) {
        action = "reject";
        outbound = void 0;
      }
      route.rules.push(new RouteRule(action, outbound).initRule(luciRuleDTO));
      if (luciRuleDTO.containDomain() || luciRuleDTO.containIp() || luciRuleDTO.containRuleSet()) {
        let dnsTag = routeRule.dnsNode;
        let detour = transOutTag(routeRule.dnsProxyNode);
        detour = detour ? detour : outbound;
        let dnsTmpl;
        if (dnsTag) {
          dnsTmpl = dnsServerMap.get(dnsTag);
        } else {
          dnsTmpl = dnsServerMap.get(route.default_domain_resolver);
        }
        let server = genDnsFromTmpl(transDnsTag(routeRule.name), detour, dnsTmpl);
        dns.servers.push(server);
        dns.rules.push(
          new DnsRule(action, transDnsTag(routeRule.name), transDnsStrategy(routeRule.dnsStrategy)).initRule(luciRuleDTO)
        );
      }
    });
    ruleSetMap.forEach((value) => {
      route.rule_set.push(value);
    });
    let log = new Log(shuntSection.logLevel);
    let fullConfig = {};
    fullConfig["log"] = log;
    fullConfig["inbounds"] = inbounds;
    fullConfig["outbounds"] = outbounds;
    fullConfig["dns"] = dns;
    fullConfig["route"] = route;
    return fullConfig;
  }
  function genDnsFromTmpl(tag, detour, tmpl) {
    return new DnsServer(tmpl.type, tag, tmpl.server, tmpl.port, detour);
  }
  function genRuleSet(rs) {
    if (rs.type === "remote") {
      return new RemoteRuleSet(rs.tag, rs.format, rs.pathOrUrl, void 0, void 0);
    } else if (rs.type === "local") {
      return new LocalRuleSet(rs.tag, rs.format, rs.pathOrUrl);
    }
  }
  function transDnsStrategy(strategy) {
    switch (strategy) {
      case "4":
        return "ipv4_only";
      case "6":
        return "ipv6_only";
      case "64":
        return "prefer_ipv6";
      case "46":
        return "prefer_ipv4";
      default:
        return void 0;
    }
  }
  function transOutTag(tag) {
    if (tag === "hijpass-block" /* BLOCK_OUTBOUND_TAG */) {
      return "block" /* BLOCK_OUTBOUND_TAG */;
    } else if (tag === "hijpass-direct" /* DIRECT_OUTBOUND_TAG */) {
      return "direct-out" /* DIRECT_OUTBOUND_TAG */;
    } else if (tag === "hijpass-slb" /* LOAD_BALANCE_OUTBOUND_TAG */) {
      return "slb" /* LOAD_BALANCE_OUTBOUND_TAG */;
    } else {
      return tag;
    }
  }
  function transDnsTag(name) {
    return name + "-dns";
  }

  // module/xray.ts
  var Log2 = class {
    constructor(logLevel) {
      __publicField(this, "loglevel");
      __publicField(this, "dnsLog");
      this.loglevel = logLevel || "info" /* DEFAULT_LOG_LEVEL */;
      this.dnsLog = false;
    }
  };
  var DnsServer2 = class {
    constructor(type, tag, address, port) {
      __publicField(this, "tag");
      __publicField(this, "address");
      __publicField(this, "port");
      __publicField(this, "queryStrategy");
      __publicField(this, "domains");
      __publicField(this, "skipFallback");
      __publicField(this, "disableCache");
      switch (type) {
        case "tcp":
          this.address = "tcp://" + address;
          this.port = port;
          break;
        case "https":
          this.address = "https://" + address;
          if (port) {
            this.address += ":" + port;
          }
          this.address += "/dns-query";
          break;
        case "quic":
          this.address = "quic://" + address;
          this.port = port;
          break;
        case "udp":
          this.address = address;
          this.port = port;
          break;
        default:
          throw new Error("Invalid xray DNS server type: " + type);
      }
      this.tag = tag;
      this.domains = [];
      this.skipFallback = true;
    }
  };
  var DNS2 = class {
    constructor(queryStrategy, cache) {
      __publicField(this, "servers");
      __publicField(this, "rules");
      __publicField(this, "queryStrategy");
      __publicField(this, "disableCache");
      __publicField(this, "serveStale");
      __publicField(this, "serveExpiredTTL");
      __publicField(this, "disableFallback");
      __publicField(this, "disableFallbackIfMatch");
      this.servers = [];
      this.rules = [];
      this.queryStrategy = queryStrategy || "UseIP" /* DEFAULT_DNS_STRATEGY */;
      this.disableCache = !cache;
      this.serveStale = !cache;
      this.serveExpiredTTL = 3600;
      this.disableFallback = false;
      this.disableFallbackIfMatch = true;
    }
  };
  var Rule2 = class {
    constructor(ruleTag, inboundTag, outbound) {
      __publicField(this, "ruleTag");
      __publicField(this, "inboundTag");
      __publicField(this, "outboundTag");
      __publicField(this, "balancerTag");
      this.ruleTag = ruleTag;
      this.inboundTag = inboundTag;
      if (outbound === "slb" /* LOAD_BALANCE_OUTBOUND_TAG */) {
        this.balancerTag = outbound;
      } else {
        this.outboundTag = outbound;
      }
    }
  };
  var RouteRule2 = class extends Rule2 {
    constructor(tag, outbound) {
      super(tag, void 0, outbound);
      __publicField(this, "domain");
      __publicField(this, "network");
      __publicField(this, "ip");
      __publicField(this, "protocol");
      __publicField(this, "port");
      this.inboundTag = ["tproxy-in" /* TPORXY_INBOUND_TAG */];
      this.domain = [];
      this.network = [];
      this.ip = [];
      this.protocol = [];
    }
  };
  var DnsRule2 = class extends Rule2 {
    constructor(tag, outbound) {
      super(void 0, tag, outbound);
    }
  };
  var Route2 = class {
    constructor() {
      __publicField(this, "rules");
      __publicField(this, "domainStrategy");
      __publicField(this, "balancers");
      this.rules = [];
      this.domainStrategy = "AsIs";
      this.balancers = [];
    }
  };
  var Outbound2 = class {
    constructor(protocol, tag) {
      __publicField(this, "settings");
      __publicField(this, "protocol");
      __publicField(this, "tag");
      this.protocol = protocol;
      this.tag = tag;
    }
  };
  var Socks2 = class extends Outbound2 {
    constructor(address, port, tag) {
      super("socks", tag);
      this.settings = {
        address,
        port
      };
    }
  };
  var DnsOutbound = class extends Outbound2 {
    constructor(tag) {
      super("dns", tag);
      this.settings = {
        nonIPQuery: "reject"
      };
    }
  };
  var Freedom = class extends Outbound2 {
    constructor(tag) {
      super("freedom", tag);
      this.settings = {
        domainStrategy: "UseIP" /* DEFAULT_DNS_STRATEGY */
      };
    }
  };
  var Balancer = class {
    constructor(tag) {
      __publicField(this, "tag");
      __publicField(this, "selector");
      __publicField(this, "fallbackTag");
      __publicField(this, "strategy");
      this.tag = tag;
      this.selector = [];
      this.fallbackTag = void 0;
      this.strategy = {
        type: "leastLoad",
        settings: {
          expected: 1,
          maxRTT: "1s",
          tolerance: 0.05
        }
      };
    }
  };
  var BurstObservatory = class {
    constructor(url, interval, timeout, sampling) {
      __publicField(this, "subjectSelector");
      __publicField(this, "pingConfig");
      this.subjectSelector = [];
      this.pingConfig = {
        destination: url ? url : "https://connectivitycheck.gstatic.com/generate_204",
        interval: interval ? interval : "60s",
        timeout: timeout ? timeout : "2s",
        sampling: sampling ? sampling : 3
      };
    }
  };
  var Inbound2 = class {
    constructor(type, port, tag) {
      __publicField(this, "protocol");
      __publicField(this, "tag");
      __publicField(this, "port");
      __publicField(this, "settings");
      __publicField(this, "streamSettings");
      __publicField(this, "sniffing");
      this.protocol = "dokodemo-door";
      this.tag = tag;
      this.port = port;
      this.settings = {
        network: "tcp,udp",
        followRedirect: void 0
      };
      if (type === "tproxy") {
        this.settings.followRedirect = true;
        this.streamSettings = {
          sockopt: {
            tproxy: "tproxy"
          }
        };
        this.sniffing = {
          enabled: true,
          destOverride: ["http", "tls", "quic"],
          routeOnly: true
        };
      }
    }
  };

  // utils/xray.ts
  var XrayUtils = {
    genShuntConf: genConf2
  };
  function genConf2() {
    let shuntSection = ShuntUtils.getShuntSection();
    let dnsServerMap = /* @__PURE__ */ new Map();
    let route = new Route2();
    let dnsConf = shuntSection.dns;
    let dns = new DNS2(transDnsStrategy2(dnsConf.defaultStrategy), dnsConf.useCache === "1");
    dnsConf.nodes.forEach(function(dnsNode) {
      let server = new DnsServer2(dnsNode.type, dnsNode.tag, dnsNode.server, Number(dnsNode.port));
      dnsServerMap.set(dnsNode.tag, server);
    });
    let routeConf = shuntSection.route;
    let outbounds = [];
    uci_default.sections("hijpass" /* CONF_NAME */, "proxy_node" /* PROXY_NODE_TYPE */, function(section) {
      if (section.enabled === "1") {
        let proxyNode = new Socks2(
          "127.0.0.1",
          Number(section.socks_port),
          transOutTag2(section.name)
        );
        if (section.name === routeConf.defaultProxyNode) {
          outbounds.unshift(proxyNode);
        } else {
          outbounds.push(proxyNode);
        }
      }
    });
    if (routeConf.defaultProxyNode === "hijpass-direct" /* DIRECT_OUTBOUND_TAG */) {
      outbounds.unshift(new Freedom("direct-out" /* DIRECT_OUTBOUND_TAG */));
    } else {
      outbounds.push(new Freedom("direct-out" /* DIRECT_OUTBOUND_TAG */));
    }
    outbounds.push(new Outbound2("blackhole", "block" /* BLOCK_OUTBOUND_TAG */));
    outbounds.push(new DnsOutbound("dns-out" /* DNS_OUTBOUND_TAG */));
    let inbounds = [
      new Inbound2("tproxy", parseInt(shuntSection.shuntListenPort, 10), "tproxy-in" /* TPORXY_INBOUND_TAG */),
      new Inbound2("direct", parseInt(shuntSection.dnsListenPort, 10), "dns-in" /* DNS_INBOUND_TAG */)
    ];
    let dnsRules = [new DnsRule2(["dns-in" /* DNS_INBOUND_TAG */], "dns-out" /* DNS_OUTBOUND_TAG */)];
    let routeRules = [];
    let defaultDnsTmpl = dnsServerMap.get(dnsConf.defaultDnsNode);
    let dnsInOutMap = /* @__PURE__ */ new Map();
    routeConf.rules.forEach(function(rule) {
      if (rule.enabled !== "1") {
        return;
      }
      let ruleOutBoundTag = transOutTag2(rule.proxyNode);
      ruleOutBoundTag = ruleOutBoundTag ? ruleOutBoundTag : outbounds[0].tag;
      let routeRule = new RouteRule2(rule.name, ruleOutBoundTag);
      let luciRuleDTO = ShuntUtils.parseRuleList(rule);
      if (luciRuleDTO.isEmpty("geo")) {
        return;
      }
      routeRule.network = luciRuleDTO.network;
      routeRule.protocol = transRouteProtocol(luciRuleDTO.protocol);
      routeRule.port = luciRuleDTO.port.join(",");
      if (luciRuleDTO.portRange) {
        luciRuleDTO.portRange.concat(routeRule.port);
      }
      routeRule.port = luciRuleDTO.portRange.join(",");
      const domainArrays = [
        addPrefixToElements(luciRuleDTO.domain, "full:"),
        addPrefixToElements(luciRuleDTO.domainSuffix, "domain:"),
        luciRuleDTO.domainKeyword,
        addPrefixToElements(luciRuleDTO.domainRegex, "regexp:"),
        luciRuleDTO.geoSite
      ];
      const ipArrays = [
        luciRuleDTO.ipCidr,
        luciRuleDTO.geoIp
      ];
      routeRule.domain = [].concat(...domainArrays.filter((item) => Array.isArray(item) && item.length > 0));
      routeRule.domain = routeRule.domain.length > 0 ? routeRule.domain : void 0;
      routeRule.ip = [].concat(...ipArrays.filter((item) => Array.isArray(item) && item.length > 0));
      routeRule.ip = routeRule.ip.length > 0 ? routeRule.ip : void 0;
      if (routeRule.domain) {
        let domainRule = structuredClone(routeRule);
        domainRule.ip = void 0;
        routeRules.push(domainRule);
      }
      if (routeRule.ip) {
        let ipRule = structuredClone(routeRule);
        ipRule.domain = void 0;
        routeRules.push(ipRule);
      }
      if (!routeRule.domain && !routeRule.ip) {
        routeRules.push(routeRule);
      }
      if (luciRuleDTO.containDomain() || luciRuleDTO.containIp() || luciRuleDTO.containGeo()) {
        let dnsTmpl;
        let outboundTag = transOutTag2(rule.dnsProxyNode);
        outboundTag = outboundTag ? outboundTag : ruleOutBoundTag;
        let dnsTag = transDnsTag2(rule.name);
        if (dnsInOutMap.has(outboundTag)) {
          dnsInOutMap.get(outboundTag).push(dnsTag);
        } else {
          dnsInOutMap.set(outboundTag, [dnsTag]);
        }
        if (rule.dnsNode) {
          dnsTmpl = dnsServerMap.get(rule.dnsNode);
        } else {
          dnsTmpl = defaultDnsTmpl;
        }
        let server = structuredClone(dnsTmpl);
        server.tag = dnsTag;
        server.queryStrategy = transDnsStrategy2(rule.dnsStrategy);
        server.domains = routeRule.domain;
        dns.servers.push(server);
      }
    });
    let defaultDnsServer = structuredClone(defaultDnsTmpl);
    defaultDnsServer.tag = transDnsTag2("default");
    defaultDnsServer.skipFallback = false;
    dns.servers.push(defaultDnsServer);
    dnsInOutMap.forEach((v2, k) => {
      let dnsRule = new DnsRule2(v2, k);
      dnsRules.push(dnsRule);
    });
    route.rules = route.rules.concat(dnsRules);
    route.rules = route.rules.concat(routeRules);
    let burstObservatory = void 0;
    if (shuntSection.loadBalance) {
      let lbConf = shuntSection.loadBalance;
      let balancer = new Balancer("slb" /* LOAD_BALANCE_OUTBOUND_TAG */);
      balancer.selector = lbConf.lbNodeList;
      balancer.fallbackTag = lbConf.lbNodeList[0];
      route.balancers.push(balancer);
      burstObservatory = new BurstObservatory(void 0, void 0, void 0, void 0);
      burstObservatory.subjectSelector = lbConf.lbNodeList;
    }
    let log = new Log2(shuntSection.logLevel);
    let fullConfig = {};
    fullConfig["log"] = log;
    fullConfig["inbounds"] = inbounds;
    fullConfig["outbounds"] = outbounds;
    fullConfig["dns"] = dns;
    fullConfig["routing"] = route;
    fullConfig["burstObservatory"] = burstObservatory;
    return fullConfig;
  }
  function transDnsTag2(name) {
    return name + "-dns";
  }
  function transOutTag2(tag) {
    if (tag === "hijpass-block" /* BLOCK_OUTBOUND_TAG */) {
      return "block" /* BLOCK_OUTBOUND_TAG */;
    } else if (tag === "hijpass-direct" /* DIRECT_OUTBOUND_TAG */) {
      return "direct-out" /* DIRECT_OUTBOUND_TAG */;
    } else if (tag === "hijpass-slb" /* LOAD_BALANCE_OUTBOUND_TAG */) {
      return "slb" /* LOAD_BALANCE_OUTBOUND_TAG */;
    } else {
      return tag;
    }
  }
  function transDnsStrategy2(strategy) {
    switch (strategy) {
      case "4":
        return "UseIPv4";
      case "6":
        return "UseIPv6";
      case "64":
      case "46":
        return "UseIP";
      default:
        return void 0;
    }
  }
  function transRouteProtocol(protocol) {
    if (!protocol) {
      return void 0;
    }
    let res = protocol.map((pro) => {
      switch (pro) {
        case "http":
        case "tls":
        case "quic":
        case "bittorrent":
          return pro;
        default:
          throw new Error("Unsupported xray rule protocol: " + pro);
      }
    }).filter((pro) => pro !== void 0);
    if (res.length === 0) {
      return void 0;
    }
    return res;
  }
  function addPrefixToElements(arr, prefix) {
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr.map((item) => prefix + item);
  }

  // utils/factory.ts
  var ShuntConfFactory = {
    getShuntUtils: function(type) {
      switch (type) {
        case "sing-box":
          return SingBoxUtils;
        case "xray":
          return XrayUtils;
      }
    }
  };

  // utils/common.ts
  var callServiceList = rpc_default.declare({
    object: "service",
    method: "list",
    params: ["name"],
    expect: { "": {} }
  });
  var MiscUtils = {
    getServiceInfo: async function() {
      const s = await L.resolveDefault(callServiceList("hijpass" /* CONF_NAME */), {});
      let instances = s["hijpass" /* CONF_NAME */]["instances"];
      return {
        proxyInfos: MiscUtils.getInstanceName("proxy_node" /* PROXY_NODE_TYPE */).map(
          (name) => {
            return instances[name];
          }
        ).filter((instance) => instance),
        shuntInfo: instances[MiscUtils.getInstanceName("shunt" /* SHUNT_SECTION_TYPE */)[0]],
        dnsInfo: instances[MiscUtils.getInstanceName("dns" /* DNS_SECTION_TYPE */)[0]]
      };
    },
    renderServiceStatus: function(res) {
      var _a, _b, _c, _d, _e;
      let renderHTML = "";
      let spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
      let isProxyRunning = ((_a = res == null ? void 0 : res.proxyInfos) != null ? _a : []).filter((instance) => instance == null ? void 0 : instance.running).length > 1;
      let isShuntRunning = (_c = (_b = res == null ? void 0 : res.shuntInfo) == null ? void 0 : _b.running) != null ? _c : false;
      let isDnsRunning = (_e = (_d = res == null ? void 0 : res.dnsInfo) == null ? void 0 : _d.running) != null ? _e : false;
      let getColorSpan = function(title, isRunning) {
        if (isRunning) {
          return spanTemp.format("green", _(title), _("\u8FD0\u884C\u4E2D"));
        } else {
          return spanTemp.format("red", _(title), _("\u672A\u8FD0\u884C"));
        }
      };
      renderHTML += getColorSpan(_("\u4EE3\u7406\u8282\u70B9"), isProxyRunning);
      renderHTML += getColorSpan(_("\u5206\u6D41\u670D\u52A1"), isShuntRunning);
      renderHTML += getColorSpan(_("DNS"), isDnsRunning);
      return renderHTML;
    },
    getInstanceName: function(sectionType) {
      return uci_default.sections("hijpass" /* CONF_NAME */, sectionType).map((section) => {
        var _a, _b;
        let cid = section[".name"];
        let name = (_b = (_a = section["name"]) != null ? _a : section["tag"]) != null ? _b : section["dns_service"];
        if (!name) {
          name = sectionType;
        }
        return cid + "-" + name;
      });
    },
    parseRuleSetPath: function(line, type) {
      let pathOrUrl = line.substring(type === "remote" ? 16 : 15);
      let filename = pathOrUrl.split("/").pop();
      let tag = filename.substring(0, filename.lastIndexOf(".")) || filename;
      let format = (type === "remote" ? pathOrUrl : filename).endsWith("srs") ? "binary" : "source";
      return { tag, type, format, pathOrUrl };
    },
    camelToSnake: function(str) {
      return str.replace(/([A-Z])/g, function(match) {
        return "_" + match.toLowerCase();
      });
    },
    transFromUci: function(object, section) {
      Object.keys(object).forEach((key) => {
        let uciOption = MiscUtils.camelToSnake(key);
        if (section[uciOption]) {
          object[key] = section[uciOption];
        }
      });
    }
  };
  var LuciUtils = {
    renderServiceStatus: function() {
      poll_default.add(async function() {
        const res = await L.resolveDefault(MiscUtils.getServiceInfo());
        let view2 = document.getElementById("service_status");
        if (view2) view2.innerHTML = MiscUtils.renderServiceStatus(res);
      });
      return E(
        "div",
        { class: "cbi-map" },
        E("fieldset", { class: "cbi-section" }, [
          E(
            "p",
            { id: "service_status", style: "display: flex; gap: 1rem;" },
            _("\u6B63\u5728\u83B7\u53D6\u72B6\u6001...")
          )
        ])
      );
    },
    genHandleSaveApply: function(notNotice) {
      return async function(ev) {
        try {
          await this.handleSave(ev);
          let data = ShuntUtils.getShuntConfData();
          if (uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */, "config_type") === "tmpl") {
            await fs_default.write(WebUtils.getFilePath("shunt_conf"), data);
          }
          ui_default.changes.apply(true);
        } catch (e) {
          if (!notNotice) {
            alert(e);
          }
        }
      };
    }
  };
  var ShuntUtils = {
    getShuntSection: function() {
      let shuntSection = new ShuntSection();
      let uSection = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */);
      MiscUtils.transFromUci(shuntSection, uSection);
      shuntSection.loadBalance = ShuntUtils.getLoadBalanceSection();
      shuntSection.dns = ShuntUtils.getDnsSection();
      shuntSection.route = ShuntUtils.getRouteSection();
      return shuntSection;
    },
    getRouteSection: function() {
      let shuntSection = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */);
      let routeSection = new RouteSection();
      MiscUtils.transFromUci(routeSection, shuntSection);
      uci_default.sections("hijpass" /* CONF_NAME */, "shunt_route_rule" /* SHUNT_ROUTE_RULE_TYPE */, function(section) {
        let rule = new ShuntRouteRule();
        MiscUtils.transFromUci(rule, section);
        routeSection.rules.push(rule);
      });
      return routeSection;
    },
    getDnsSection: function() {
      let shuntSection = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */);
      let dnsSection = new DnsSection();
      dnsSection.nodes = [];
      MiscUtils.transFromUci(dnsSection, shuntSection);
      uci_default.sections("hijpass" /* CONF_NAME */, "shunt_dns_node" /* SHUNT_DNS_NODE_TYPE */, function(section) {
        let server = new DnsNode();
        MiscUtils.transFromUci(server, section);
        dnsSection.nodes.push(server);
      });
      return dnsSection;
    },
    getLoadBalanceSection: function() {
      let shuntSection = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */);
      let loadBalanceSection = new LoadBalanceNode();
      MiscUtils.transFromUci(loadBalanceSection, shuntSection);
      return loadBalanceSection;
    },
    /**
     * 解析规则列表，根据前缀分类
     * @returns {RuleDTO} 包含不同类型规则的对象
     */
    parseRuleList: function(rule) {
      let result = new RuleDTO();
      let domainRules = rule.domainList;
      let ipRules = rule.ipList;
      result.network = rule.network ? rule.network : [];
      result.protocol = rule.protocol ? rule.protocol : [];
      if (rule.port) {
        result.port = rule.port.map((port) => parseInt(port, 10)).filter((port) => !isNaN(port));
      }
      if (rule.portRange) {
        result.portRange = rule.portRange.map((range) => range.replace("-", ":")).filter((range) => range.length > 0);
      }
      if (domainRules && domainRules.trim() !== "") {
        let lines = domainRules.split("\n");
        for (let line of lines) {
          line = line.trim();
          if (line === "" || line.startsWith("#")) {
            continue;
          }
          if (line.startsWith("rule-set:")) {
            let type = line.startsWith("rule-set:remote:") ? "remote" : "local";
            let ruleSet = MiscUtils.parseRuleSetPath(line, type);
            result.ruleSet.push(ruleSet);
            continue;
          }
          if (line.startsWith("regexp:")) {
            result.domainRegex.push(line.substring(7));
          } else if (line.startsWith("domain:")) {
            result.domainSuffix.push(line.substring(7));
          } else if (line.startsWith("full:")) {
            result.domain.push(line.substring(5));
          } else if (line.startsWith("geosite:")) {
            result.geoSite.push(line);
          } else {
            result.domainKeyword.push(line);
          }
        }
      }
      if (ipRules && ipRules.trim() !== "") {
        let lines = ipRules.split("\n");
        for (let line of lines) {
          if (line === "" || line.startsWith("#")) {
            continue;
          }
          if (line.startsWith("rule-set:")) {
            let type = line.startsWith("rule-set:remote:") ? "remote" : "local";
            let ruleSet = MiscUtils.parseRuleSetPath(line, type);
            result.ruleSet.push(ruleSet);
            continue;
          }
          if (line.startsWith("geoip:")) {
            result.geoIp.push(line);
          } else {
            result.ipCidr.push(line);
          }
        }
      }
      return result;
    },
    getShuntConfData: function() {
      let data = "";
      if (uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */, "config_type") === "tmpl") {
        let type = uci_default.get_first(
          "hijpass" /* CONF_NAME */,
          "shunt" /* SHUNT_SECTION_TYPE */,
          "type"
        );
        data = JSON.stringify(ShuntConfFactory.getShuntUtils(type).genShuntConf(), ShuntUtils.omitEmptyReplacer, 2);
      }
      return data;
    },
    omitEmptyReplacer: function(_2, value) {
      if (Array.isArray(value) && value.length === 0) {
        return void 0;
      }
      if (value === null) {
        return void 0;
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        return void 0;
      }
      if (typeof value === "string" && !value.trim()) {
        return void 0;
      }
      return value;
    }
  };
  var WebUtils = {
    // 创建标签验证器
    createTagValidator: function(sectionType, fieldName) {
      return function(section_id, value) {
        let formatResult = WebUtils.validateNameFormat(section_id, value);
        if (formatResult !== true) {
          return formatResult;
        }
        let duplicate = false;
        uci_default.sections("hijpass" /* CONF_NAME */, sectionType, function(section) {
          if (section[".name"] !== section_id && section[fieldName] === value) {
            duplicate = true;
          }
        });
        if (duplicate) {
          return _("%s\u5DF2\u5B58\u5728\uFF0C\u8BF7\u4F7F\u7528\u5176\u4ED6%s").format(fieldName === "tag" ? _("\u6807\u7B7E") : _("\u540D\u79F0"), fieldName === "tag" ? _("\u6807\u7B7E") : _("\u540D\u79F0"));
        }
        return true;
      };
    },
    // 端口冲突检查函数
    validateProxyPortConflict: function(sectionId, value) {
      let shuntSection = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */);
      if (shuntSection && shuntSection[".name"] != sectionId) {
        if (shuntSection.dns_listen_port && shuntSection.dns_listen_port === value || shuntSection.shunt_listen_port && shuntSection.shunt_listen_port === value) {
          return _("\u7AEF\u53E3 %s \u5DF2\u88AB\u5206\u6D41\u914D\u7F6E\u5360\u7528").format(value);
        }
      }
      let proxySections = uci_default.sections("hijpass" /* CONF_NAME */, "proxy_node" /* PROXY_NODE_TYPE */);
      for (let i = 0; i < proxySections.length; i++) {
        let section = proxySections[i];
        let sectionName = section[".name"];
        if (sectionName === sectionId) {
          continue;
        }
        if (section.listen_port && section.listen_port === value) {
          return _('\u7AEF\u53E3 %s \u5DF2\u88AB\u4EE3\u7406\u8282\u70B9 "%s" \u4F7F\u7528').format(value, section.name);
        }
      }
      return true;
    },
    validateNameFormat: function(sectionId, value) {
      if (!value || value === "") {
        return _("\u8282\u70B9\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return _("\u8282\u70B9\u540D\u79F0\u53EA\u80FD\u5305\u542B\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u548C\u8FDE\u5B57\u7B26");
      }
      return true;
    },
    // 生成唯一的section ID
    generateUniqueSectionId: function() {
      let chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let result = "";
      for (; ; ) {
        result = "";
        for (let i = 0; i < 8; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!uci_default.get("hijpass" /* CONF_NAME */, result)) {
          break;
        }
      }
      return result;
    },
    setAnonymousGridSectionMembers: function(section) {
      WebUtils.setGridSectionMembers(section);
      section.anonymous = true;
      section.sectiontitle = function(sectionId) {
        return uci_default.get("hijpass" /* CONF_NAME */, sectionId, "name") || uci_default.get("hijpass" /* CONF_NAME */, sectionId, "tag") || sectionId;
      };
    },
    setGridSectionMembers: function(section) {
      section.anonymous = false;
      section.addremove = true;
      section.sortable = true;
      section.nodescriptions = true;
      section.rowcolors = true;
    },
    simpleHash: function(str) {
      let hash = 0;
      str = str ? str : "";
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    },
    setEditorOptionMembers: function(o, filePath, fieldName) {
      o.rows = 30;
      o.load = function(_2) {
        return fs_default.trimmed(filePath);
      };
      async function writeFile(sectionId, formvalue) {
        let currentHash = WebUtils.simpleHash(formvalue);
        let oldHash = uci_default.get_first("hijpass" /* CONF_NAME */, sectionId, fieldName);
        if (currentHash == oldHash) {
          return;
        }
        uci_default.set("hijpass" /* CONF_NAME */, sectionId, fieldName, WebUtils.simpleHash(formvalue));
        await fs_default.write(filePath, (formvalue || "").trim().replace(/\r\n/g, "\n") + "\n");
      }
      o.write = writeFile;
      o.monospace = true;
      return o;
    },
    createTextOption: function(s, tabName, fieldName, title, description, filePath) {
      let o = s.taboption(tabName, form_default.TextValue, fieldName, title, description);
      WebUtils.setEditorOptionMembers(o, filePath, fieldName);
      return o;
    },
    getFilePath: function(option) {
      let path = uci_default.get_first("hijpass" /* CONF_NAME */, "hijpass" /* GLOBAL_SECTION_TYPE */, option);
      if (path) {
        return path;
      }
      console.log(option + " path is empty");
      return "";
    },
    // 设置TypedSection为单例
    setAnonymousSection: function(subsection) {
      subsection.anonymous = true;
      subsection.addremove = false;
    }
  };

  // luci-virtual:view
  var view_default = view;

  // views/shunt.ts
  var v = view_default.extend({
    load: function() {
      return Promise.all([
        uci_default.load("hijpass" /* CONF_NAME */)
      ]);
    },
    handleSave: async function(ev) {
      try {
        await view_default.prototype.handleSave(ev);
        ShuntUtils.getShuntConfData();
      } catch (e) {
        alert(e);
      }
    },
    handleSaveApply: LuciUtils.genHandleSaveApply(true),
    render: function() {
      let m = new form_default.Map(
        "hijpass" /* CONF_NAME */,
        _("\u5206\u6D41\u8BBE\u7F6E"),
        _("\u914D\u7F6E\u5206\u6D41\u89C4\u5219\u548C\u8BBE\u7F6E")
      );
      let s = m.section(form_default.TypedSection, "shunt" /* SHUNT_SECTION_TYPE */);
      s.anonymous = true;
      s.addremove = false;
      createTabs(s);
      createBasicOptions(s);
      createConfigEditor(s);
      createRouteOptions(s);
      createDNSOptions(s);
      createSLBOptions(s);
      return m.render();
    }
  });
  function createBasicOptions(s) {
    let serviceType = s.taboption(
      "basic",
      form_default.ListValue,
      "type",
      _("\u5206\u6D41\u7C7B\u578B"),
      _("\u9009\u62E9\u5206\u6D41\u7A0B\u5E8F\u7C7B\u578B")
    );
    HijpassValues.SHUNT_CONF_TYPE.forEach(function(type) {
      serviceType.value(type);
    });
    serviceType.default = "xray";
    serviceType.rmempty = false;
    let configType = s.taboption(
      "basic",
      form_default.ListValue,
      "config_type",
      _("\u914D\u7F6E\u7C7B\u578B"),
      _("\u9009\u62E9\u914D\u7F6E\u7C7B\u578B")
    );
    configType.value("tmpl", _("\u6A21\u677F\u914D\u7F6E"));
    configType.value("custom", _("\u81EA\u5B9A\u4E49\u7F16\u8F91"));
    configType.rmempty = true;
    let shuntListenPort = s.taboption(
      "basic",
      form_default.Value,
      "shunt_listen_port",
      _("\u5206\u6D41\u76D1\u542C\u7AEF\u53E3"),
      _("\u6307\u5B9A\u5206\u6D41\u76D1\u542C\u7AEF\u53E3\u53F7")
    );
    shuntListenPort.default = "1041";
    shuntListenPort.datatype = "port";
    shuntListenPort.rmempty = false;
    let dnsListenPort = s.taboption(
      "basic",
      form_default.Value,
      "dns_listen_port",
      _("DNS\u76D1\u542C\u7AEF\u53E3"),
      _("\u6307\u5B9ADNS\u76D1\u542C\u7AEF\u53E3\u53F7")
    );
    dnsListenPort.default = "10153";
    dnsListenPort.datatype = "port";
    dnsListenPort.rmempty = false;
    let logLevel = s.taboption("basic", form_default.ListValue, "log_level", _("\u65E5\u5FD7\u7B49\u7EA7"), _("\u65E5\u5FD7\u8BB0\u5F55\u7B49\u7EA7"));
    HijpassValues.SING_BOX_LOG_LEVELS.forEach(function(level) {
      logLevel.value(level, level);
    });
    logLevel.rmempty = false;
    let logPath = s.taboption(
      "basic",
      form_default.Value,
      "log_path",
      _("\u65E5\u5FD7\u8DEF\u5F84"),
      _("\u6307\u5B9A\u8BB0\u5F55\u65E5\u5FD7\u7684\u5177\u4F53\u8DEF\u5F84")
    );
    logPath.default = "/tmp/log/hijpass-shunt.log";
    logPath.rmempty = false;
    let previewConfigButton = s.taboption(
      "basic",
      form_default.Button,
      "_preview_config",
      _("\u9884\u89C8\u914D\u7F6E"),
      _("\u70B9\u51FB\u9884\u89C8\u751F\u6210\u7684Sing-Box\u914D\u7F6E")
    );
    previewConfigButton.depends("config_type", "tmpl");
    previewConfigButton.inputtitle = _("\u9884\u89C8\u914D\u7F6E");
    previewConfigButton.inputstyle = "apply";
    previewConfigButton.onclick = preview;
  }
  function createConfigEditor(s) {
    let o = s.taboption("config", form_default.TextValue, "shunt_hash", null, "\u4FEE\u6539\u5206\u6D41\u914D\u7F6E\u6587\u4EF6");
    o.depends("config_type", "custom");
    WebUtils.setEditorOptionMembers(o, WebUtils.getFilePath("shunt_conf"), "shunt_hash");
    let defaultWrite = o.write;
    o.write = shuntConfWrite(defaultWrite);
    o.remove = shuntConfWrite(defaultWrite);
    o.rmempty = false;
  }
  function createRouteOptions(s) {
    let routeTypeSectionValue = createSectionContainer(
      s,
      "route",
      "_route_global",
      form_default.TypedSection,
      "shunt" /* SHUNT_SECTION_TYPE */,
      _("\u8DEF\u7531\u5168\u5C40\u914D\u7F6E")
    );
    let routeTypeSection = routeTypeSectionValue.subsection;
    WebUtils.setAnonymousSection(routeTypeSection);
    let defaultProxyNode = createRequiredListValue(
      routeTypeSection,
      "default_proxy_node",
      _("\u9ED8\u8BA4\u5168\u5C40\u51FA\u53E3"),
      _("\u9009\u62E9\u9ED8\u8BA4\u4F7F\u7528\u7684\u51FA\u53E3\u8282\u70B9\uFF0C\u672A\u547D\u4E2D\u7684\u8DEF\u7531\u3001rule-set\u66F4\u65B0\u4F1A\u4F7F\u7528\u8BE5\u51FA\u53E3"),
      function(section_id, value) {
        if (!value) {
          return _("\u8BF7\u5148\u914D\u7F6E\u5168\u5C40\u51FA\u53E3");
        }
        return true;
      }
    );
    loadProxyNodeOptions(defaultProxyNode, "slb-only");
    let routeGridSectionValue = s.taboption(
      "route",
      form_default.SectionValue,
      "_route_rule",
      form_default.GridSection,
      "shunt_route_rule" /* SHUNT_ROUTE_RULE_TYPE */,
      _("\u8DEF\u7531\u89C4\u5219\u914D\u7F6E")
    );
    routeGridSectionValue.depends({ config_type: "tmpl" });
    let routeGridSection = routeGridSectionValue.subsection;
    routeGridSection.rowcolors = true;
    WebUtils.setAnonymousGridSectionMembers(routeGridSection);
    routeGridSection.modaltitle = _("\u7F16\u8F91\u8DEF\u7531\u89C4\u5219");
    routeGridSection.sectiontitle = function(section_id) {
      return uci_default.get("hijpass" /* CONF_NAME */, section_id, "name") || _("\u672A\u547D\u540D\u89C4\u5219");
    };
    routeGridSection.rowcolors = true;
    routeGridSection.tab("_rule", _("\u89C4\u5219"));
    routeGridSection.tab("_dns", _("DNS\u914D\u7F6E"));
    let name = routeGridSection.taboption("_rule", form_default.Value, "name", _("\u89C4\u5219\u540D\u79F0"));
    name.validate = WebUtils.createTagValidator("shunt_route_rule" /* SHUNT_ROUTE_RULE_TYPE */, "name");
    name.rmempty = false;
    name.modalonly = true;
    let enabled = routeGridSection.taboption("_rule", form_default.Flag, "enabled", _("\u542F\u7528"));
    enabled.default = "1";
    enabled.rmempty = false;
    enabled.editable = true;
    let proxyNode = routeGridSection.taboption("_rule", form_default.ListValue, "proxy_node", _("\u4EE3\u7406\u8282\u70B9"));
    proxyNode.rmempty = false;
    proxyNode.editable = true;
    loadProxyNodeOptions(proxyNode, true);
    let dnsNode = routeGridSection.taboption("_dns", form_default.ListValue, "dns_node", _("DNS\u670D\u52A1\u5668"), _("\u4EC5\u5728\u89C4\u5219\u4E2D\u5B58\u5728\u57DF\u540D\u3001geosite\u3001rule_set\u65F6\u751F\u6548"));
    loadDNSServerOptions(dnsNode, true);
    dnsNode.cfgvalue = function(sectionId) {
      let dnsNode2 = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "dns_node");
      if (dnsNode2) {
        return dnsNode2;
      }
      return _("-");
    };
    let dnsStrategy = routeGridSection.taboption("_dns", form_default.ListValue, "dns_strategy", _("DNS\u7B56\u7565"), _("4\uFF1A\u53EA\u4F7F\u7528v4<br>6\uFF1A\u53EA\u4F7F\u7528v6<br>46\uFF1A\u4F18\u5148v4\uFF08\u53EA\u5728sing-box\u6A21\u5F0F\u4E0B\u751F\u6548\uFF0Cxray\u81EA\u52A8\u66FF\u6362\u4E3A\u53CC\u6808\uFF09<br>64\uFF1A\u4F18\u5148v6\uFF08\u53EA\u5728sing-box\u6A21\u5F0F\u4E0B\u751F\u6548\uFF0Cxray\u81EA\u52A8\u66FF\u6362\u4E3A\u53CC\u6808\uFF09<br>"));
    dnsStrategy.value("", _("\u4F7F\u7528\u5168\u5C40\u9ED8\u8BA4\u89E3\u6790\u7B56\u7565"));
    HijpassValues.DNS_STRATEGY_VALUES.forEach(function(strategy) {
      dnsStrategy.value(strategy, strategy);
    });
    dnsStrategy.modalonly = true;
    let dnsProxyNode = routeGridSection.taboption("_dns", form_default.ListValue, "dns_proxy_node", _("DNS\u51FA\u53E3\u8282\u70B9"));
    dnsProxyNode.value("", _("\u4F7F\u7528\u8DEF\u7531\u4EE3\u7406\u8282\u70B9"));
    dnsProxyNode.value("hijpass-direct", _("\u76F4\u8FDE"));
    uci_default.sections("hijpass" /* CONF_NAME */, "proxy_node" /* PROXY_NODE_TYPE */, function(section) {
      if (section.name) {
        let displayName = section.name;
        if (section.socks_port) {
          displayName += " (" + section.socks_port + ")";
        }
        dnsProxyNode.value(section.name, displayName);
      }
    });
    dnsProxyNode.modalonly = true;
    let network = routeGridSection.taboption("_rule", form_default.MultiValue, "network", _("\u7F51\u7EDC"));
    network.value("tcp");
    network.value("udp");
    network.cfgvalue = function(sectionId) {
      let networks = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "network");
      if (networks) {
        return networks.join(",");
      }
      return "-";
    };
    let protocol = routeGridSection.taboption("_rule", form_default.MultiValue, "protocol", _("\u534F\u8BAE"), _("\u5F53\u524Dxray\u4EC5\u652F\u6301http\u3001tls\u3001quic\u548Cbittorrent"));
    protocol.value("tls");
    protocol.value("http");
    protocol.value("quic");
    protocol.value("stun");
    protocol.value("dns");
    protocol.value("bittorrent");
    protocol.value("dtls");
    protocol.value("ssh");
    protocol.value("rdp");
    protocol.value("ntp");
    protocol.cfgvalue = function(sectionId) {
      let protocols = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "protocol");
      if (protocols) {
        return protocols.join(",");
      }
      return "-";
    };
    let port = routeGridSection.taboption("_rule", form_default.DynamicList, "port", _("\u7AEF\u53E3"));
    port.datatype = "port";
    port.placeholder = "80";
    port.modalonly = true;
    let portRange = routeGridSection.taboption("_rule", form_default.DynamicList, "port_range", _("\u7AEF\u53E3\u8303\u56F4"));
    portRange.datatype = "portrange";
    portRange.placeholder = "1000-2000";
    portRange.modalonly = true;
    let portView = routeGridSection.option(form_default.TextValue, "_port_view", _("\u7AEF\u53E3\u8303\u56F4"));
    portView.textvalue = function(sectionId) {
      let port2 = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "port");
      let portRange2 = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "port_range");
      let value = [];
      if (port2) {
        value.push(...port2);
      }
      if (portRange2) {
        value.push(...portRange2);
      }
      return value.join(",") || "-";
    };
    portView.modalonly = false;
    let domainList = routeGridSection.taboption("_rule", form_default.TextValue, "domain_list", _("\u57DF\u540D\u89C4\u5219\u5217\u8868"), _("\u7EAF\u5B57\u7B26\u4E32: \u5F53\u6B64\u5B57\u7B26\u4E32\u5339\u914D\u76EE\u6807\u57DF\u540D\u4E2D\u4EFB\u610F\u90E8\u5206\uFF0C\u8BE5\u89C4\u5219\u751F\u6548\u3002<br>\u6B63\u5219\u8868\u8FBE\u5F0F: \u7531'regexp:'\u5F00\u59CB\uFF0C\u4F59\u4E0B\u90E8\u5206\u662F\u4E00\u4E2A\u6B63\u5219\u8868\u8FBE\u5F0F\u3002<br>\u5B50\u57DF\u540D (\u63A8\u8350): \u7531'domain:'\u5F00\u59CB\uFF0C\u4F59\u4E0B\u90E8\u5206\u662F\u4E00\u4E2A\u57DF\u540D\u3002\u5F53\u6B64\u57DF\u540D\u662F\u76EE\u6807\u57DF\u540D\u6216\u5176\u5B50\u57DF\u540D\u65F6\uFF0C\u8BE5\u89C4\u5219\u751F\u6548\u3002<br>\u5B8C\u6574\u5339\u914D: \u7531'full:'\u5F00\u59CB\uFF0C\u4F59\u4E0B\u90E8\u5206\u662F\u4E00\u4E2A\u57DF\u540D\u3002\u5F53\u6B64\u57DF\u540D\u5B8C\u6574\u5339\u914D\u76EE\u6807\u57DF\u540D\u65F6\uFF0C\u8BE5\u89C4\u5219\u751F\u6548\u3002<br>geosite: \u5F62\u5982'geosite:cn'\u3002<br>rule-set: \u5F62\u5982'rule-set:local:/path/rulefile'\u6216'rule-set:remote:https://file'\u3002<br>\u6CE8\u91CA: \u7531 # \u5F00\u5934"));
    domainList.rows = 4;
    domainList.monospace = true;
    domainList.modalonly = true;
    let domainListView = routeGridSection.option(form_default.TextValue, "_domain_list_view", _("\u57DF\u540D\u89C4\u5219\u6570"));
    domainListView.textvalue = function(sectionId) {
      let domainList2 = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "domain_list");
      if (domainList2) {
        return domainList2.split("\n").filter((item) => !item.startsWith("#")).length;
      }
      return "-";
    };
    let ipList = routeGridSection.taboption("_rule", form_default.TextValue, "ip_list", _("IP\u89C4\u5219\u5217\u8868"), _("IP: \u5F62\u5982'127.0.0.1'\u3002<br>CIDR: \u5F62\u5982'10.0.0.0/8'.<br>geoip: \u5F62\u5982'geoip:cn'\u3002<br>rule-set: \u5F62\u5982'rule-set:local:/path/rulefile'\u6216'rule-set:remote:https://file'\u3002<br>\u6CE8\u91CA: \u7531 # \u5F00\u5934"));
    ipList.rows = 4;
    ipList.monospace = true;
    ipList.modalonly = true;
    let ipListView = routeGridSection.option(form_default.TextValue, "_ip_list_view", _("IP\u89C4\u5219\u6570"));
    ipListView.textvalue = function(sectionId) {
      let ipList2 = uci_default.get("hijpass" /* CONF_NAME */, sectionId, "ip_list");
      if (ipList2) {
        return ipList2.split("\n").filter((item) => !item.startsWith("#")).length;
      }
      return "-";
    };
  }
  function createDNSOptions(s) {
    let dnsTypeSectionValue = createSectionContainer(
      s,
      "dns",
      "_dns_global",
      form_default.TypedSection,
      "shunt" /* SHUNT_SECTION_TYPE */,
      _("DNS\u5168\u5C40\u914D\u7F6E")
    );
    let dnsTypeSection = dnsTypeSectionValue.subsection;
    WebUtils.setAnonymousSection(dnsTypeSection);
    let defaultDNSNode = createRequiredListValue(
      dnsTypeSection,
      "default_dns_node",
      _("\u9ED8\u8BA4\u5168\u5C40DNS"),
      _("\u9009\u62E9\u9ED8\u8BA4\u4F7F\u7528\u7684DNS\u670D\u52A1\u5668\uFF0C\u672A\u547D\u4E2D\u8DEF\u7531\u5C06\u4F7F\u7528\u6B64DNS"),
      function(section_id, value) {
        if (!value) {
          return _("\u8BF7\u5148\u914D\u7F6E\u5168\u5C40DNS\u670D\u52A1\u5668");
        }
        return true;
      }
    );
    loadDNSServerOptions(defaultDNSNode, false);
    let defaultStrategy = dnsTypeSection.option(
      form_default.ListValue,
      "default_strategy",
      _("\u9ED8\u8BA4DNS\u89E3\u6790\u7B56\u7565"),
      _("4\uFF1A\u53EA\u4F7F\u7528v4<br>6\uFF1A\u53EA\u4F7F\u7528v6<br>46\uFF1A\u4F18\u5148v4\uFF08\u53EA\u5728sing-box\u6A21\u5F0F\u4E0B\u751F\u6548\uFF0Cxray\u81EA\u52A8\u66FF\u6362\u4E3A\u53CC\u6808\uFF09<br>64\uFF1A\u4F18\u5148v6\uFF08\u53EA\u5728sing-box\u6A21\u5F0F\u4E0B\u751F\u6548\uFF0Cxray\u81EA\u52A8\u66FF\u6362\u4E3A\u53CC\u6808\uFF09<br>")
    );
    HijpassValues.DNS_STRATEGY_VALUES.forEach(function(strategy) {
      defaultStrategy.value(strategy, strategy);
    });
    defaultStrategy.rmempty = false;
    let useCache = dnsTypeSection.option(form_default.Flag, "use_cache", _("DNS\u7F13\u5B58"));
    useCache.rmempty = false;
    let dnsGridSectionValue = s.taboption(
      "dns",
      form_default.SectionValue,
      "_dns_servers",
      form_default.GridSection,
      "shunt_dns_node" /* SHUNT_DNS_NODE_TYPE */,
      _("DNS\u8282\u70B9\u914D\u7F6E")
    );
    dnsGridSectionValue.depends({ config_type: "tmpl" });
    let dnsGridSection = dnsGridSectionValue.subsection;
    dnsGridSection.rowcolors = true;
    dnsGridSection.anonymous = true;
    dnsGridSection.addremove = true;
    dnsGridSection.sortable = true;
    dnsGridSection.nodescriptions = true;
    dnsGridSection.modaltitle = _("\u7F16\u8F91DNS\u670D\u52A1\u5668");
    dnsGridSection.sectiontitle = function(section_id) {
      return uci_default.get("hijpass" /* CONF_NAME */, section_id, "tag") || _("\u672A\u547D\u540D");
    };
    let type = dnsGridSection.option(
      form_default.ListValue,
      "type",
      _("\u7C7B\u578B"),
      _("DNS\u670D\u52A1\u5668\u7C7B\u578B")
    );
    type.value("tcp", "TCP");
    type.value("udp", "UDP");
    type.value("tls", "TLS\uFF08\u4EC5sing-box\u652F\u6301\uFF09");
    type.value("https", "HTTPS");
    type.value("quic", "QUIC");
    type.default = "tcp";
    type.rmempty = false;
    let tag = dnsGridSection.option(
      form_default.Value,
      "tag",
      _("\u6807\u7B7E"),
      _("DNS\u670D\u52A1\u5668\u7684\u552F\u4E00\u6807\u8BC6")
    );
    tag.placeholder = "dns-local";
    tag.rmempty = false;
    tag.validate = WebUtils.createTagValidator("shunt_dns_node" /* SHUNT_DNS_NODE_TYPE */, "tag");
    tag.modalonly = true;
    let server = dnsGridSection.option(
      form_default.Value,
      "server",
      _("\u670D\u52A1\u5668"),
      _("DNS\u670D\u52A1\u5668\u5730\u5740")
    );
    server.placeholder = "8.8.8.8";
    server.datatype = "ipaddr";
    server.rmempty = false;
    let port = dnsGridSection.option(
      form_default.Value,
      "port",
      _("\u7AEF\u53E3"),
      _("DNS\u670D\u52A1\u5668\u7AEF\u53E3")
    );
    port.placeholder = "53";
    port.datatype = "port";
    port.rmempty = true;
  }
  function createSLBOptions(s) {
    let o = s.taboption(
      "slb",
      form_default.SectionValue,
      "_slb_global",
      form_default.TypedSection,
      "shunt" /* SHUNT_SECTION_TYPE */,
      _("\u8D1F\u8F7D\u5747\u8861\u914D\u7F6E")
    );
    o.depends({ config_type: "tmpl" });
    let ss = o.subsection;
    ss.anonymous = true;
    ss.addremove = false;
    createValidatedDynamicList(
      ss,
      "lb_node_list",
      _("\u8D1F\u8F7D\u5747\u8861"),
      _("\u6839\u636E\u6240\u9009\u8282\u70B9\u5065\u5EB7\u5EA6\u81EA\u52A8\u8C03\u6574\u51FA\u53E3\u8DEF\u7531\uFF0C\u914D\u7F6E\u540E\u53EF\u5728\u4EE3\u7406\u8282\u70B9\u5904\u9009\u62E9\u8D1F\u8F7D\u5747\u8861\u8282\u70B9"),
      "proxy_node" /* PROXY_NODE_TYPE */,
      function(section) {
        if (section.name) {
          let displayName = section.name;
          if (section.socks_port) {
            displayName += " (" + section.socks_port + ")";
          }
          return {
            value: section.name,
            display: displayName
          };
        }
        return null;
      }
    );
    let testUrl = ss.option(
      form_default.Value,
      "url",
      _("\u6D4B\u8BD5URL"),
      _("\u8F93\u5165\u4E00\u4E2A\u6D4B\u8BD5\u7684URL\u5730\u5740\uFF0C\u9ED8\u8BA4\u4F7F\u7528 https://www.gstatic.com/generate_204")
    );
    testUrl.depends({ lb_node_list: /^\s*\S.*$/ });
    let testInterval = ss.option(
      form_default.Value,
      "interval",
      _("\u6D4B\u8BD5\u95F4\u9694"),
      _("\u8BBE\u7F6E\u6D4B\u8BD5\u7684\u95F4\u9694\u65F6\u95F4\uFF0C\u9ED8\u8BA43m")
    );
    testInterval.depends({ lb_node_list: /^\s*\S.*$/ });
    let testTimeout = ss.option(
      form_default.Value,
      "timeout",
      _("\u6D4B\u8BD5\u8D85\u65F6"),
      _("\u8BBE\u7F6E\u6D4B\u8BD5\u7684\u8D85\u65F6\u65F6\u95F4\uFF0C\u9ED8\u8BA42s")
    );
    testTimeout.depends({ lb_node_list: /^\s*\S.*$/ });
  }
  function createTabs(s) {
    s.tab("basic", _("\u57FA\u7840\u914D\u7F6E"));
    s.tab("config", _("\u5206\u6D41\u914D\u7F6E\u7F16\u8F91"));
    s.tab("route", _("\u8DEF\u7531\u914D\u7F6E"));
    s.tab("dns", _("DNS\u670D\u52A1\u5668\u914D\u7F6E"));
    s.tab("slb", _("\u8D1F\u8F7D\u5747\u8861"));
    s.tab("ruleset", _("\u89C4\u5219\u96C6"));
  }
  function resetHash() {
    let data = ShuntUtils.getShuntConfData();
    if (data === "") {
      uci_default.set_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */, "shunt_hash", -1);
      return false;
    }
    let currentHash = WebUtils.simpleHash(data);
    let oldHash = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */, "shunt_hash");
    if (currentHash !== oldHash) {
      uci_default.set_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */, "shunt_hash", currentHash);
      return true;
    }
    return false;
  }
  function preview() {
    try {
      let configJson = ShuntUtils.getShuntConfData();
      ui_default.showModal(_("Sing-Box \u914D\u7F6E\u9884\u89C8"), [
        E("div", { "class": "cbi-section" }, [
          E(
            "div",
            { "class": "cbi-section-descr" },
            _("\u4EE5\u4E0B\u662F\u6839\u636E\u5F53\u524D\u914D\u7F6E\u751F\u6210\u7684Sing-Box JSON\u914D\u7F6E\uFF1A")
          ),
          E("pre", {
            "style": "max-height: 500px; overflow: auto; padding: 10px; border-radius: 4px;",
            "id": "config-preview-content"
          }, configJson)
        ]),
        E("div", {
          "class": "right",
          "style": "display: flex; justify-content: flex-end; align-items: center; gap: 10px;"
        }, [
          E("button", {
            "class": "btn cbi-button",
            "click": ui_default.hideModal
          }, _("\u5173\u95ED")),
          E("button", {
            "class": "btn cbi-button-action",
            "click": function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              let content = document.getElementById("config-preview-content").textContent;
              navigator.clipboard.writeText(content).then(function() {
                alert(_("\u914D\u7F6E\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"));
              });
            }
          }, _("\u590D\u5236\u914D\u7F6E"))
        ])
      ]);
    } catch (err) {
      alert(_("\u751F\u6210\u914D\u7F6E\u5931\u8D25\uFF1A") + err.message);
      console.error("Config generation error:", err);
    }
  }
  function shuntConfWrite(func) {
    return function(section_id) {
      if (uci_default.get_first(
        "hijpass" /* CONF_NAME */,
        "shunt" /* SHUNT_SECTION_TYPE */,
        "config_type"
      ) === "tmpl") {
        resetHash();
      } else {
        return func.call(this, section_id, "");
      }
    };
  }
  function loadProxyNodeOptions(option, includeSLB) {
    option.load = function(section_id) {
      delete this.keylist;
      delete this.vallist;
      this.value("hijpass-direct" /* DIRECT_OUTBOUND_TAG */, _("\u76F4\u8FDE"));
      if (includeSLB !== false) {
        this.value("hijpass-block" /* BLOCK_OUTBOUND_TAG */, _("\u963B\u6B62"));
      }
      uci_default.sections("hijpass" /* CONF_NAME */, "proxy_node" /* PROXY_NODE_TYPE */, function(section) {
        if (section.name) {
          let displayName = section.name;
          if (section.socks_port) {
            displayName += " (" + section.socks_port + ")";
          }
          this.value(section.name, displayName);
        }
      }.bind(this));
      if (includeSLB !== false) {
        let slbOutbounds = uci_default.get_first(
          "hijpass" /* CONF_NAME */,
          "shunt" /* SHUNT_SECTION_TYPE */,
          "lb_node_list"
        );
        if (slbOutbounds && slbOutbounds.length > 0) {
          this.value("hijpass-slb" /* LOAD_BALANCE_OUTBOUND_TAG */, _("\u8D1F\u8F7D\u5747\u8861"));
        }
      }
      return form_default.ListValue.prototype.load.apply(this, [section_id]);
    };
  }
  function loadDNSServerOptions(option, includeDefault) {
    option.load = function(section_id) {
      delete this.keylist;
      delete this.vallist;
      if (includeDefault) {
        this.value("", _("\u4F7F\u7528\u5168\u5C40\u9ED8\u8BA4DNS"));
      }
      uci_default.sections("hijpass" /* CONF_NAME */, "shunt_dns_node" /* SHUNT_DNS_NODE_TYPE */, function(section) {
        if (section.tag) {
          let displayName = section.tag;
          if (section.server) {
            displayName += " (" + section.server + ")";
          }
          this.value(section.tag, displayName);
        }
      }.bind(this));
      return form_default.ListValue.prototype.load.apply(this, [section_id]);
    };
  }
  function createSectionContainer(s, tab, id, sectionType, sectionName, title) {
    let o = s.taboption(tab, form_default.SectionValue, id, sectionType, sectionName, title);
    o.depends({ config_type: "tmpl" });
    return o;
  }
  function createRequiredListValue(section, name, title, description, validator) {
    let o = section.option(form_default.ListValue, name, title, description);
    o.rmempty = false;
    if (validator) {
      o.validate = validator;
    }
    return o;
  }
  function createValidatedDynamicList(section, name, title, description, sectionType, getItemName) {
    let o = section.option(form_default.DynamicList, name, title, description);
    o.load = function(section_id) {
      delete this.keylist;
      delete this.vallist;
      uci_default.sections("hijpass" /* CONF_NAME */, sectionType, function(section2) {
        let itemName = getItemName(section2);
        if (itemName) {
          this.value(itemName.value, itemName.display);
        }
      }.bind(this));
      return form_default.DynamicList.prototype.load.apply(this, [section_id]);
    };
    o.validate = function(section_id, value) {
      if (!value || value === "") {
        return true;
      }
      let availableItems = [];
      uci_default.sections("hijpass" /* CONF_NAME */, sectionType, function(section2) {
        let itemName = getItemName(section2);
        if (itemName) {
          availableItems.push(itemName.value);
        }
      });
      if (availableItems.indexOf(value) === -1) {
        return _('%s "%s" \u4E0D\u5B58\u5728\uFF0C\u8BF7\u4ECE\u4E0B\u62C9\u5217\u8868\u4E2D\u9009\u62E9\u6216\u5148\u5728\u914D\u7F6E\u4E2D\u6DFB\u52A0').format(title, value);
      }
      return true;
    };
    return o;
  }
  var shunt_default = v;
  return __toCommonJS(shunt_exports);
})();


return LuciView.default;
