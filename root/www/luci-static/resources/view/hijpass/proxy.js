'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require rpc';

return view.extend({
    render: function () {
        var m, s, o;

        m = new form.Map('hijpass', _('代理设置'),
            _('配置代理程序设置'));

        s = m.section(form.TypedSection, 'proxy');
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Value, 'command', _('运行命令'),
            _('指定代理程序运行命令'));
        o.default = '/usr/bin/hysteria -c /var/etc/hijpass/proxy.json clien';
        o.rmempty = false;

        o = s.option(form.Flag, 'log_redirect', _('日志重定向'),
            _('重定向执行日志到文件，不开启默认输出至系统日志'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Value, 'log_path', _('日志路径'),
            _('指定记录日志的具体路径'));
        o.depends('log_redirect', '1');
        o.default = '/tmp/log/hijpass-proxy.log'
        o.rmempty = false;

        return m.render();
    }
});