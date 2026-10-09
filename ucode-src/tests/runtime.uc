// Test driver: invokes the installed modules with ordinary inputs; production modules have no test branches.
import * as fs from 'fs';
import { cursor } from 'uci';
import * as firewall from '../../root/usr/share/ucode/hijpass/runtime/firewall.uc';
import * as service from '../../root/usr/share/ucode/hijpass/runtime/service.uc';
import * as network from '../../root/usr/share/ucode/hijpass/runtime/network.uc';
import * as rules from '../../root/usr/share/ucode/hijpass/runtime/rules.uc';
import * as files from '../../root/usr/share/ucode/hijpass/runtime/files.uc';
import * as system from '../../root/usr/share/ucode/hijpass/runtime/system.uc';
import { architecture } from '../../root/usr/share/ucode/hijpass/runtime/update.uc';
import { migrate } from '../../root/usr/share/ucode/hijpass/runtime/defaults.uc';
import { read } from '../../root/usr/share/ucode/hijpass/uci/config.uc';
import { render } from '../../root/usr/share/ucode/hijpass/generator/render.uc';
import { parse } from '../../root/usr/share/ucode/hijpass/diagnostics/capture.uc';
import { packetSummary, report } from '../../root/usr/share/ucode/hijpass/diagnostics/report.uc';

let request = json(fs.stdin.read('all')), result;
switch (request.action) {
case 'firewall': result = firewall.generate(request.sections, request.state, fs.readfile(request.template)); break;
case 'plan': result = service.plan(request.sections); break;
case 'server-plan': result = service.serverPlan(request.sections); break;
case 'write': result = service.writeConfigs(request.sections, request.generated || render(request.sections)); break;
case 'normalize': result = rules.normalize(request.text, request.kind); break;
case 'update': result = rules.update(request.sections, request.group); break;
case 'geo': result = rules.geo('-t', null, [], request.sections); break;
case 'contains': result = map(request.cases, pair => network.contains(pair[0], pair[1])); break;
case 'exec': result = system.exec(request.args); break;
case 'connect': result = network.connect(request.url, request.timeout); break;
case 'migrate':
	// UCI delta storage must be separate from config storage, otherwise libuci locks the same file twice.
	system.mkdir(request.directory + '/delta');
	migrate(cursor(request.directory, request.directory + '/delta')); result = read('hijpass', request.directory); break;
case 'cleanup': files.cleanup(request.sections, request.kind, request.id, request.keep); result = true; break;
case 'clean-log': files.cleanLogs(request.sections, request.operation, request.path); result = true; break;
case 'arch': result = architecture(request.core, request.machine); break;
case 'trace-parse': result = parse(request.args); break;
case 'packet-summary': result = packetSummary(request.packets); break;
case 'trace-report': result = report(request.capture, request.directory, []); break;
default: die('unknown test operation');
}
printf('%J\n', result);
