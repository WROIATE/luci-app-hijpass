'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require rpc';
'require view.hijpass.common as common';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('hijpass')
        ]);
    },

    render: function () {
        var m, s, o;

        m = new form.Map('hijpass', _('HiJpass'));

        s = m.section(form.TypedSection);
        s.anonymous = true;
        s.render = common.getServiceStatus;

        s = m.section(form.TypedSection, 'hijpass');
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Flag, 'enable', _('启用'),
            _('启用或禁用 HiJpass'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Flag, 'startup_delay', _('延迟启动'),
            _('启用或禁用延迟启动'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Value, 'delay_time', _('延迟时间'),
            _('服务启动前的延迟时间（秒）'));
        o.datatype = 'uinteger';
        o.depends('startup_delay', '1');
        o.default = '60'
        o.rmempty = false;

        return m.render();
    }
}); 