import view from "view";
import uci from "uci";
import {LuciFlied} from "../enum/hijpass";
import form from "form";
import {LuciUtils, WebUtils} from "../utils/common";
import fs from "fs";
import network from "network";


const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME),
        ]);
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),

    render: async function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('防火墙配置'),
            _('配置nftables相关功能'));

        let s = m.section(form.TypedSection, LuciFlied.FIREWALL_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;
        // 创建标签页
        createTabs(s);

        // 创建基础配置选项
        createGeneralOptions(s);
        // 创建 ACL 配置选项
        await createAclOptions(s);
        // 创建文本编辑选项
        createTextOptions(s);

        return m.render();
    }
});

// 创建基础配置选项
function createGeneralOptions(s: LuCI.form.AbstractSection) {
    // TPROXY 协议配置
    let o = s.taboption('basic', form.ListValue, 'tproxy_proto', _('TPROXY 协议'),
        _('指定 TPROXY 协议类型'));
    o.value('tcp', 'TCP');
    o.value('udp', 'UDP');
    o.value('tcp,udp', 'TCP + UDP');
    o.default = 'tcp,udp';
    o.rmempty = false;

    // 代理端口配置
    createPortOptions(s);

    // 列表选项配置
    createListOptions(s);
}

// 创建端口选择选项
function createPortOptions(s: LuCI.form.AbstractSection) {
    let proxyPort = s.taboption('basic', form.ListValue, 'proxy_port', _('代理端口'),
        _('选择代理应用端口号，可从代理节点端口中选择'));
    WebUtils.appendEnabledNodeListenPorts(proxyPort);
    proxyPort.value('', _('不使用'));
    proxyPort.default = '';
    proxyPort.rmempty = true;

    let shuntPort = s.taboption('basic', form.ListValue, 'shunt_port', _('默认分流端口'),
        _('选择分流应用端口号，可从分流端口或代理节点端口中选择'));
    const shuntListenPort = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_listen_port');
    if (shuntListenPort) {
        shuntPort.value(shuntListenPort, _('分流端口: %s').format(shuntListenPort));
    }
    WebUtils.appendEnabledNodeListenPorts(shuntPort);
    shuntPort.value('', _('不使用'));
    shuntPort.default = '';
    shuntPort.rmempty = true;
}

// 创建列表选项
function createListOptions(s: LuCI.form.AbstractSection) {
    let o = s.taboption('basic', form.Flag, 'use_chnroute', _('使用 CHN 路由'),
        _('启用中国 IP 路由列表进行分流'));

    o.rmempty = true;
}

// 创建所有文本编辑选项
function createTextOptions(s: LuCI.form.AbstractSection) {
    // IP 直连列表（IPv4 + IPv6）
    WebUtils.createTextOption(s, 'ip_direct', 'ip_direct_hash', null,
        _('编辑 IP CIDR 直连列表配置（支持 IPv4 和 IPv6）'),
        WebUtils.getFilePath('ip_direct'));

    // IP 代理列表（IPv4 + IPv6）
    WebUtils.createTextOption(s, 'ip_proxy', 'ip_proxy_hash', null,
        _('编辑 IP CIDR 代理列表配置（支持 IPv4 和 IPv6）'), WebUtils.getFilePath('ip_proxy'));

    // 防火墙规则
    WebUtils.createTextOption(s, 'nftables', 'nft_hash', null, _('编辑防火墙 nftables 规则'), WebUtils.getFilePath('nft'));

    // 用户自定义启动脚本
    WebUtils.createTextOption(s, 'hook', 'nft_hook_hash', null,
        _('用户自定义脚本，会在服务服务规则初始化后执行脚本内容，不会在停止时执行，因此请不要在脚本中修改hijpass表以外的规则'),
        WebUtils.getFilePath('nft_hook'));
}

// 创建所有标签页
function createTabs(s: LuCI.form.AbstractSection) {
    s.tab('basic', _('基本设置'));
    s.tab('acl', _('访问控制列表'));
    s.tab('ip_direct', _('IP 直连列表'));
    s.tab('ip_proxy', _('IP 代理列表'));
    s.tab('nftables', _('防火墙规则'));
    s.tab('hook', _('自定义脚本'));
}

// 创建 ACL 访问控制列表配置选项
async function createAclOptions(s: LuCI.form.AbstractSection) {
    // 代理客户端 MAC 地址列表
    let proxyMacOpt = s.taboption('acl', form.DynamicList, 'proxy_mac_list', _('代理客户端 MAC 地址'),
        _('指定需要走代理的客户端 MAC 地址列表，如：AA:BB:CC:DD:EE:FF'));
    proxyMacOpt.datatype = 'macaddr';
    proxyMacOpt.rmempty = true;

    await network.getHostHints().then(function (result: any) {
        Object.keys(result?.hosts ?? {}).forEach((mac: any) => {

            let name = result.hosts[mac].name;
            let ip = result.hosts[mac].ipaddrs.length > 0 ? result.hosts[mac].ipaddrs[0] : undefined;
            let fname = ((name ?? "") + " " + (ip ?? "")).trim()
            proxyMacOpt.value(mac, mac + " " + (fname ? "(" + fname + ")" : ""));
        })
    })

    // 代理客户端接口列表
    let proxyIfaceOpt = s.taboption('acl', form.DynamicList, 'proxy_iface_list', _('代理客户端接口'),
        _('指定需要走代理的网络接口名称列表，如：br-lan、eth0'));
    proxyIfaceOpt.rmempty = true;

    // 添加已知网络接口到数据列表
    await network.getDevices().then(function (result: any) {
        result.forEach(function (device: any) {
            proxyIfaceOpt.value(device.device, device.device);
        })
    })
}

export default v;