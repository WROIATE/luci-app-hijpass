
'use strict';
'require view';
'require uci';
'require form';
'require fs';
'require rpc';
'require poll';
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

  // views/overview.ts
  var overview_exports = {};
  __export(overview_exports, {
    default: () => overview_default
  });

  // luci-virtual:view
  var view_default = view;

  // luci-virtual:uci
  var uci_default = uci;

  // luci-virtual:form
  var form_default = form;

  // luci-virtual:fs
  var fs_default = fs;

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

  // views/overview.ts
  var v = view_default.extend({
    load: function() {
      return Promise.all([
        uci_default.load("hijpass" /* CONF_NAME */)
      ]);
    },
    handleSaveApply: LuciUtils.genHandleSaveApply(false),
    render: function() {
      let m = new form_default.Map("hijpass" /* CONF_NAME */, _("HiJpass"));
      let s = m.section(form_default.TypedSection);
      s.anonymous = true;
      s.render = LuciUtils.renderServiceStatus;
      s = m.section(form_default.TypedSection, "hijpass" /* GLOBAL_SECTION_TYPE */);
      s.anonymous = true;
      s.addremove = false;
      let enabled = s.option(
        form_default.Flag,
        "enabled",
        _("\u542F\u7528"),
        _("\u542F\u7528\u6216\u7981\u7528 HiJpass")
      );
      enabled.default = "0";
      enabled.rmempty = false;
      let delayTime = s.option(
        form_default.Value,
        "delay_time",
        _("\u5EF6\u8FDF\u65F6\u95F4"),
        _("\u670D\u52A1\u542F\u52A8\u524D\u7684\u5EF6\u8FDF\u65F6\u95F4\uFF08\u79D2\uFF09")
      );
      delayTime.datatype = "uinteger";
      delayTime.default = "60";
      delayTime.rmempty = false;
      let logLevel = s.option(
        form_default.ListValue,
        "log_level",
        _("\u65E5\u5FD7\u7B49\u7EA7"),
        _("\u670D\u52A1\u65E5\u5FD7\u7B49\u7EA7")
      );
      logLevel.modalonly = true;
      logLevel.value("DEBUG", _("\u8C03\u8BD5"));
      logLevel.value("INFO", _("\u4FE1\u606F"));
      logLevel.value("WARN", _("\u8B66\u544A"));
      logLevel.value("ERROR", _("\u9519\u8BEF"));
      logLevel.default = "INFO";
      logLevel.rmempty = false;
      let preview = s.option(form_default.Button, "_preview");
      preview.render = function() {
        return createActionButtons();
      };
      let sTest = m.section(form_default.TypedSection, "connectivity_test_section");
      sTest.anonymous = true;
      sTest.addremove = false;
      sTest.render = createConnectivityTest;
      return m.render();
    }
  });
  function createActionButtons() {
    requestAnimationFrame(function() {
      setupActionListeners();
    });
    return E("div", { "class": "cbi-value", "style": "margin-bottom: 2rem;" }, [
      E("label", { "class": "cbi-value-title" }, _("\u670D\u52A1\u63A7\u5236")),
      E("div", { "class": "cbi-value-field" }, [
        E("button", {
          "class": "cbi-button cbi-button-action",
          "id": "restart-service",
          "style": "margin-right: 10px;"
        }, _("\u91CD\u542F\u670D\u52A1")),
        E("button", {
          "class": "cbi-button cbi-button-neutral",
          "id": "reload-firewall",
          "style": "margin-right: 10px;"
        }, _("\u5237\u65B0\u9632\u706B\u5899")),
        E("span", {
          "id": "action-status",
          "style": "margin-left: 10px; font-size: 12px; color: #666;"
        })
      ])
    ]);
  }
  function setupActionListeners() {
    let restartBtn = document.getElementById("restart-service");
    if (restartBtn) {
      restartBtn.addEventListener("click", function() {
        restartService();
      });
    }
    let reloadBtn = document.getElementById("reload-firewall");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", function() {
        reloadFirewall();
      });
    }
  }
  function restartService() {
    updateActionStatus(_("\u6B63\u5728\u91CD\u542F\u670D\u52A1..."));
    fs_default.exec("/etc/init.d/hijpass", ["restart"]).then(function(result) {
      if (result.code === 0) {
        updateActionStatus(_("\u670D\u52A1\u91CD\u542F\u6210\u529F"));
        setTimeout(function() {
          location.reload();
        }, 2e3);
      } else {
        updateActionStatus(_("\u670D\u52A1\u91CD\u542F\u5931\u8D25: ") + (result.stderr || result.stdout));
      }
    }).catch(function(error) {
      updateActionStatus(_("\u670D\u52A1\u91CD\u542F\u5931\u8D25: ") + error.message);
    });
  }
  function reloadFirewall() {
    updateActionStatus(_("\u6B63\u5728\u5237\u65B0\u9632\u706B\u5899..."));
    fs_default.exec("/usr/lib/hijpass/nft.sh", ["reset"]).then(function(result) {
      if (result.code === 0) {
        updateActionStatus(_("\u9632\u706B\u5899\u5237\u65B0\u6210\u529F"));
      } else {
        updateActionStatus(_("\u9632\u706B\u5899\u5237\u65B0\u5931\u8D25: ") + (result.stderr || result.stdout));
      }
    }).catch(function(error) {
      updateActionStatus(_("\u9632\u706B\u5899\u5237\u65B0\u5931\u8D25: ") + error.message);
    });
  }
  function updateActionStatus(message) {
    let statusElement = document.getElementById("action-status");
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.style.color = message.includes("\u6210\u529F") ? "#4caf50" : message.includes("\u5931\u8D25") ? "#f44336" : "#666";
    }
  }
  function createConnectivityTest() {
    const testSites = [
      {
        id: "baidu",
        name: "\u767E\u5EA6",
        url: "https://www.baidu.com",
        svg: '<svg height="32" style="flex:none;line-height:1" viewBox="0 0 24 24" width="32" xmlns="http://www.w3.org/2000/svg"><title>Baidu</title><path d="M8.859 11.735c1.017-1.71 4.059-3.083 6.202.286 1.579 2.284 4.284 4.397 4.284 4.397s2.027 1.601.73 4.684c-1.24 2.956-5.64 1.607-6.005 1.49l-.024-.009s-1.746-.568-3.776-.112c-2.026.458-3.773.286-3.773.286l-.045-.001c-.328-.01-2.38-.187-3.001-2.968-.675-3.028 2.365-4.687 2.592-4.968.226-.288 1.802-1.37 2.816-3.085zm.986 1.738v2.032h-1.64s-1.64.138-2.213 2.014c-.2 1.252.177 1.99.242 2.148.067.157.596 1.073 1.927 1.342h3.078v-7.514l-1.394-.022zm3.588 2.191l-1.44.024v3.956s.064.985 1.44 1.344h3.541v-5.3h-1.528v3.979h-1.46s-.466-.068-.553-.447v-3.556zM9.82 16.715v3.06H8.58s-.863-.045-1.126-1.049c-.136-.445.02-.959.088-1.16.063-.203.353-.671.951-.85H9.82zm9.525-9.036c2.086 0 2.646 2.06 2.646 2.742 0 .688.284 3.597-2.309 3.655-2.595.057-2.704-1.77-2.704-3.08 0-1.374.277-3.317 2.367-3.317zM4.24 6.08c1.523-.135 2.645 1.55 2.762 2.513.07.625.393 3.486-1.975 4-2.364.515-3.244-2.249-2.984-3.544 0 0 .28-2.797 2.197-2.969zm8.847-1.483c.14-1.31 1.69-3.316 2.931-3.028 1.236.285 2.367 1.944 2.137 3.37-.224 1.428-1.345 3.313-3.095 3.082-1.748-.226-2.143-1.823-1.973-3.424zM9.425 1c1.307 0 2.364 1.519 2.364 3.398 0 1.879-1.057 3.4-2.364 3.4s-2.367-1.521-2.367-3.4C7.058 2.518 8.118 1 9.425 1z" fill="#2932E1" fill-rule="nonzero"></path></svg>'
      },
      {
        id: "google",
        name: "Google",
        url: "https://www.google.com/ncr",
        svg: '<svg height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Google</title><path d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z" fill="#4285F4"></path><path d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z" fill="#34A853"></path><path d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z" fill="#FBBC05"></path><path d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z" fill="#EB4335"></path></svg>'
      },
      {
        id: "github",
        name: "GitHub",
        url: "https://github.com",
        svg: '<svg fill="currentColor" fill-rule="evenodd" height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Github</title><path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"></path></svg>'
      },
      {
        id: "bilibili",
        name: "\u54D4\u54E9\u54D4\u54E9",
        url: "https://www.bilibili.com",
        svg: '<svg height="32" width="32" style="flex:none;line-height:1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>bilibili</title><path clip-rule="evenodd" d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z" fill="#1b7be1" fill-rule="evenodd"></path></svg>'
      }
    ];
    requestAnimationFrame(setupConnectivityTestListeners(testSites));
    return E("div", {
      "id": "custom-connectivity-test",
      "class": "cbi-map"
    }, [
      E("h2", {}, _("\u7F51\u7AD9\u8FDE\u901A\u6027\u6D4B\u8BD5")),
      E("div", {
        "class": "cbi-section",
        "style": "display: flex; gap: 18px; padding: 18px; justify-content: center;"
      }, testSites.map((site) => createTestButton(site)))
    ]);
  }
  function createTestButton(info) {
    return E("div", {
      "class": "connectivity-test-button",
      "style": "flex: 1; min-width: 120px;"
    }, [
      E("div", {
        "class": "connectivity-btn cbi-section",
        "id": "test-" + info.id,
        "style": "width: 100%; height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 15px; border-radius: 8px; padding: 0; box-shadow: 0 0 2rem 0 rgba(136, 152, 170, .15); border:1px solid rgba(0, 0, 0, .05); cursor: pointer;"
      }, [
        E("div", {
          "style": "display: flex; align-items: center; justify-content: center;"
        }, [
          E("span", {
            "style": "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;"
          }, [E("raw", {}, info.svg)])
        ]),
        E("div", {
          "style": "font-weight: bold; font-size: 16px; margin-bottom: 2px;"
        }, info.name),
        E("div", {
          "id": "test-result-" + info.id,
          "style": "font-size: 13px; color: #f44336;"
        }, _("\u70B9\u51FB\u6D4B\u8BD5"))
      ])
    ]);
  }
  function setupConnectivityTestListeners(testSites) {
    return function() {
      testSites.forEach((site) => {
        let testBtn = document.getElementById("test-" + site.id);
        if (testBtn) {
          testBtn.addEventListener("click", function() {
            testConnectivity(site.id, site.url);
          });
        }
      });
    };
  }
  function testConnectivity(id, url) {
    const resultElement = document.getElementById("test-result-" + id);
    const buttonElement = document.getElementById("test-" + id);
    if (resultElement && buttonElement) {
      resultElement.textContent = _("\u6D4B\u8BD5\u4E2D...");
      resultElement.style.color = "#666";
      buttonElement.disabled = true;
      buttonElement.style.opacity = "0.7";
      fs_default.exec_direct("/usr/lib/hijpass/connect.sh", [url, "5"], "json").then((r) => {
        console.log(r);
        updateTestResult(id, r.success, r);
      }).catch((e) => {
        console.error(e);
        updateTestResult(id, false, void 0);
      });
    }
  }
  function updateTestResult(id, success, response) {
    const resultElement = document.getElementById("test-result-" + id);
    const buttonElement = document.getElementById("test-" + id);
    if (resultElement && buttonElement) {
      buttonElement.disabled = false;
      buttonElement.style.opacity = "1";
      if (success) {
        if (/^([45])\d{2}$/.test(response.http_code)) {
          resultElement.textContent = _("\u8FDE\u63A5\u5F02\u5E38\uFF0Ccode ") + response.http_code;
          resultElement.style.color = "#f44336";
        } else {
          resultElement.textContent = response.tls_handshake_time_ms + " ms";
          resultElement.style.color = "#4caf50";
        }
      } else {
        resultElement.textContent = _("\u6D4B\u8BD5\u5931\u8D25\uFF0C\u8BF7\u7ED3\u5408\u65E5\u5FD7\u6392\u67E5");
        resultElement.style.color = "#f44336";
      }
    }
  }
  var overview_default = v;
  return __toCommonJS(overview_exports);
})();


return LuciView.default;
