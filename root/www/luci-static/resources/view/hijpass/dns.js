
'use strict';
'require view';
'require uci';
'require form';
'require rpc';
'require poll';
'require fs';
'require ui';

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

  // views/dns.ts
  var dns_exports = {};
  __export(dns_exports, {
    default: () => dns_default
  });

  // luci-virtual:view
  var view_default = view;

  // luci-virtual:uci
  var uci_default = uci;

  // luci-virtual:form
  var form_default = form;

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

  // luci-virtual:fs
  var fs_default = fs;

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

  // views/dns.ts
  var v = view_default.extend({
    load: function() {
      return Promise.all([
        uci_default.load("hijpass" /* CONF_NAME */)
      ]);
    },
    handleSaveApply: LuciUtils.genHandleSaveApply(false),
    render: function() {
      let m = new form_default.Map("hijpass" /* CONF_NAME */, _("DNS\u5206\u6D41\u8BBE\u7F6E"), _("\u914D\u7F6EDNS\u5206\u6D41\u76F8\u5173\u8BBE\u7F6E"));
      let s = m.section(form_default.TypedSection, "dns" /* DNS_SECTION_TYPE */);
      s.anonymous = true;
      s.addremove = false;
      s.tab("basic", _("\u57FA\u672C\u8BBE\u7F6E"));
      s.tab("domain_direct", _("\u57DF\u540D\u76F4\u8FDE\u5217\u8868"));
      s.tab("domain_proxy", _("\u57DF\u540D\u4EE3\u7406\u5217\u8868"));
      let dnsService = s.taboption(
        "basic",
        form_default.ListValue,
        "dns_service",
        _("\u5206\u6D41\u670D\u52A1"),
        _("\u9009\u62E9DNS\u5206\u6D41\u670D\u52A1\u7C7B\u578B")
      );
      dnsService.value("chinadns-ng", "chinadns-ng");
      dnsService.value("custom", _("\u81EA\u5B9A\u4E49"));
      dnsService.default = "chinadns-ng";
      dnsService.rmempty = false;
      let chinaDnsPort = s.taboption(
        "basic",
        form_default.Value,
        "cdg_port",
        _("\u76D1\u542C\u7AEF\u53E3"),
        _("\u6307\u5B9AChinaDNS-NG\u7684\u76D1\u542C\u7AEF\u53E3")
      );
      chinaDnsPort.depends("dns_service", "chinadns-ng");
      chinaDnsPort.default = "53653";
      chinaDnsPort.datatype = "port";
      chinaDnsPort.rmempty = false;
      let directDns = s.taboption(
        "basic",
        form_default.ListValue,
        "direct_dns",
        _("\u76F4\u8FDE\u57DF\u540DDNS"),
        _("\u9009\u62E9\u76F4\u8FDE\u57DF\u540D\u4F7F\u7528\u7684DNS\u670D\u52A1\u5668")
      );
      directDns.value("system", _("\u4F7F\u7528\u7CFB\u7EDFDNS"));
      directDns.value("custom", _("\u81EA\u5B9A\u4E49DNS"));
      directDns.default = "system";
      directDns.rmempty = false;
      let directDnsCustom = s.taboption(
        "basic",
        form_default.Value,
        "direct_dns_custom",
        _("\u81EA\u5B9A\u4E49\u76F4\u8FDEDNS"),
        _("\u6307\u5B9A\u76F4\u8FDE\u57DF\u540D\u4F7F\u7528\u7684DNS\u670D\u52A1\u5668")
      );
      directDnsCustom.depends("direct_dns", "custom");
      directDnsCustom.default = "223.5.5.5#53";
      directDnsCustom.rmempty = false;
      let proxyDns = s.taboption(
        "basic",
        form_default.ListValue,
        "proxy_dns",
        _("\u4EE3\u7406\u57DF\u540DDNS"),
        _("\u9009\u62E9\u4EE3\u7406\u57DF\u540D\u4F7F\u7528\u7684DNS\u670D\u52A1\u5668")
      );
      proxyDns.depends("dns_service", "chinadns-ng");
      proxyDns.value("system", _("\u4F7F\u7528\u7CFB\u7EDFDNS"));
      proxyDns.value("custom", _("\u81EA\u5B9A\u4E49DNS"));
      proxyDns.default = "system";
      proxyDns.rmempty = false;
      let shuntSections = uci_default.sections("hijpass", "shunt");
      let defaultDnsPort = null;
      if (shuntSections && shuntSections.length > 0) {
        shuntSections.forEach(function(shuntSection) {
          if (shuntSection.dns_listen_port) {
            let dnsPort = shuntSection.dns_listen_port;
            proxyDns.value("127.0.0.1#" + dnsPort, _("\u5206\u6D41DNS\u7AEF\u53E3: %s").format(dnsPort));
            defaultDnsPort = "127.0.0.1#" + dnsPort;
          }
        });
      }
      proxyDns.value("custom", _("\u81EA\u5B9A\u4E49DNS"));
      proxyDns.default = defaultDnsPort || "custom";
      proxyDns.rmempty = false;
      let proxyDnsCustom = s.taboption(
        "basic",
        form_default.Value,
        "proxy_dns_custom",
        _("\u81EA\u5B9A\u4E49\u4EE3\u7406DNS"),
        _("\u6307\u5B9A\u4EE3\u7406\u57DF\u540D\u4F7F\u7528\u7684DNS\u670D\u52A1\u5668")
      );
      proxyDnsCustom.depends("proxy_dns", "custom");
      proxyDnsCustom.default = "1.1.1.1#53";
      proxyDnsCustom.rmempty = false;
      let useGfw = s.taboption(
        "basic",
        form_default.Flag,
        "use_gfw",
        _("\u4F7F\u7528 GFW \u5217\u8868"),
        _("\u542F\u7528 GFW \u57DF\u540D\u5217\u8868\u8FDB\u884C\u5206\u6D41")
      );
      useGfw.rmempty = true;
      useGfw.depends("dns_service", "chinadns-ng");
      let useChn = s.taboption(
        "basic",
        form_default.Flag,
        "use_chn",
        _("\u4F7F\u7528 CHN \u5217\u8868"),
        _("\u542F\u7528\u4E2D\u56FD\u57DF\u540D\u5217\u8868\u8FDB\u884C\u5206\u6D41")
      );
      useChn.rmempty = true;
      useChn.depends("dns_service", "chinadns-ng");
      let startHook = s.taboption(
        "basic",
        form_default.Value,
        "start_hook",
        _("\u542F\u52A8\u811A\u672C\u8DEF\u5F84"),
        _("\u4F1A\u5728dns\u670D\u52A1\u542F\u52A8\u9636\u6BB5\u6267\u884C")
      );
      startHook.placeholder = "/etc/hijpass/dns-start.sh";
      startHook.rmempty = true;
      let stopHook = s.taboption(
        "basic",
        form_default.Value,
        "stop_hook",
        _("\u505C\u6B62\u811A\u672C\u8DEF\u5F84"),
        _("\u4F1A\u5728dns\u670D\u52A1\u505C\u6B62\u9636\u6BB5\u6267\u884C")
      );
      stopHook.placeholder = "/etc/hijpass/dns-stop.sh";
      stopHook.rmempty = true;
      WebUtils.createTextOption(
        s,
        "domain_direct",
        "domain_direct_hash",
        null,
        _("\u7F16\u8F91\u57DF\u540D\u76F4\u8FDE\u5217\u8868\u914D\u7F6E\uFF0C\u914D\u5408chinadns-ng\u4F7F\u7528"),
        WebUtils.getFilePath("domain_direct")
      );
      WebUtils.createTextOption(
        s,
        "domain_proxy",
        "domain_proxy_hash",
        null,
        _("\u7F16\u8F91\u57DF\u540D\u4EE3\u7406\u5217\u8868\u914D\u7F6E\uFF0C\u914D\u5408chinadns-ng\u4F7F\u7528"),
        WebUtils.getFilePath("domain_proxy")
      );
      return m.render();
    }
  });
  var dns_default = v;
  return __toCommonJS(dns_exports);
})();


return LuciView.default;
