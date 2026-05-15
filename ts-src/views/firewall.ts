import view from "view";
import uci from "uci";
import { LuciFlied } from "../enum/hijpass";
import form from "form";
import { LuciUtils, WebUtils } from "../utils/common";
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

    // 当前生效的防火墙规则（默认空，按钮触发加载）
    let nftViewOpt = s.taboption('nftables', form.TextValue, '_nft_view');
    nftViewOpt.readonly = true;
    nftViewOpt.rows = 30;
    nftViewOpt.monospace = true;
    nftViewOpt.load = function () { return ''; };
    nftViewOpt.write = function () { };
    (nftViewOpt as any).renderWidget = function (section_id: string, option_index: number, cfgvalue: any) {
        let widget = (form.TextValue.prototype as any).renderWidget.call(this, section_id, option_index, cfgvalue) as HTMLElement;
        let textarea = widget.querySelector('textarea') as HTMLTextAreaElement;
        textarea.placeholder = _('点击查看按钮获取当前hijpass的防火墙信息');
        let btn = E('button', {
            class: 'cbi-button cbi-button-action',
            style: 'float: right;',
            click: function () {
                (btn as HTMLButtonElement).setAttribute('disabled', 'true');
                textarea.value = _('加载中...');
                fs.exec_direct('/usr/lib/hijpass/nft.sh', ['show'], 'text')
                    .then((res: any) => {
                        textarea.value = res?.trim() || _('暂无规则（服务未运行）');
                    })
                    .catch(() => { textarea.value = _('读取失败'); })
                    .finally(() => { (btn as HTMLButtonElement).removeAttribute('disabled'); });
            }
        }, _('查看当前防火墙'));
        return E('div', {}, [widget, btn,]);
    };

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
    // 代理模式开关
    // 关闭（默认）：默认不代理，下方列表为走代理设备
    // 开启：默认全代理，下方列表为不走代理设备
    let aclMode = s.taboption('acl', form.Flag, 'acl_default_allow', _('默认全走代理'),
        _('关闭：默认不代理，列表内设备走代理<br>开启：默认全代理，列表内设备不走代理'));
    aclMode.rmempty = false;
    aclMode.default = '0';

    // 获取主机和接口列表（供下方选项复用）
    let hostHints: any = {};
    let devices: any[] = [];
    await Promise.all([
        network.getHostHints().then((r: any) => { hostHints = r?.hosts ?? {}; }),
        network.getDevices().then((r: any) => { devices = r ?? []; }),
    ]);

    const buildMacLabel = (mac: string) => {
        let name = hostHints[mac]?.name;
        let ip = hostHints[mac]?.ipaddrs?.[0];
        let label = ((name ?? '') + ' ' + (ip ?? '')).trim();
        return mac + (label ? ' (' + label + ')' : '');
    };
    const ifaceValidate = function (_sectionId: string, value: string) {
        if (!value) return true;
        const exists = devices.some((d: any) => d.device === value);
        if (!exists) return _('接口 "%s" 不存在').format(value);
        return true;
    };

    // 关闭模式：走代理设备（MAC）
    let proxyMacOpt = s.taboption('acl', form.DynamicList, 'proxy_mac_list', _('走代理设备（MAC）'),
        _('默认不代理模式下，指定需要走代理的设备 MAC'));
    proxyMacOpt.datatype = 'macaddr';
    proxyMacOpt.rmempty = true;
    proxyMacOpt.depends('acl_default_allow', '0');
    Object.keys(hostHints).forEach((mac: any) => proxyMacOpt.value(mac, buildMacLabel(mac)));

    // 关闭模式：走代理接口
    let proxyIfaceOpt = s.taboption('acl', form.DynamicList, 'proxy_iface_list', _('走代理接口'),
        _('默认不代理模式下，指定需要走代理的网络接口'));
    proxyIfaceOpt.rmempty = true;
    proxyIfaceOpt.depends('acl_default_allow', '0');
    proxyIfaceOpt.validate = ifaceValidate;
    devices.forEach((d: any) => { proxyIfaceOpt.value(d.device, d.device); });

    // 开启模式：不走代理设备（MAC）
    let excludeMacOpt = s.taboption('acl', form.DynamicList, 'proxy_mac_exclude_list', _('不走代理设备（MAC）'),
        _('默认全代理模式下，指定不走代理的设备 MAC'));
    excludeMacOpt.datatype = 'macaddr';
    excludeMacOpt.rmempty = true;
    excludeMacOpt.depends('acl_default_allow', '1');
    Object.keys(hostHints).forEach((mac: any) => excludeMacOpt.value(mac, buildMacLabel(mac)));

    // 开启模式：不走代理接口
    let excludeIfaceOpt = s.taboption('acl', form.DynamicList, 'proxy_iface_exclude_list', _('不走代理接口'),
        _('默认全代理模式下，指定不走代理的网络接口'));
    excludeIfaceOpt.rmempty = true;
    excludeIfaceOpt.depends('acl_default_allow', '1');
    excludeIfaceOpt.validate = ifaceValidate;
    devices.forEach((d: any) => { excludeIfaceOpt.value(d.device, d.device); });
}

export default v;