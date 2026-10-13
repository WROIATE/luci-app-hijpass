// Test driver: invokes the installed modules with ordinary inputs; production modules have no test branches.
import * as fs from 'fs';
import { cursor } from 'uci';
import * as firewall from '../../root/usr/lib/hijpass/firewall/generate.uc';
import * as service from '../../root/usr/lib/hijpass/service/prepare.uc';
import * as network from '../../root/usr/lib/hijpass/network/network.uc';
import * as rules from '../../root/usr/lib/hijpass/rules/rules.uc';
import * as files from '../../root/usr/lib/hijpass/maintenance/logs.uc';
import * as system from '../../root/usr/share/ucode/hijpass/common.uc';
import { architecture } from '../../root/usr/lib/hijpass/core/release.uc';
import { migrate } from '../../root/usr/lib/hijpass/maintenance/migrate.uc';
import { read } from '../../root/usr/share/ucode/hijpass/uci/read.uc';
import { render } from '../../root/usr/share/ucode/hijpass/coreconfig/render.uc';
import { parse } from '../../root/usr/lib/hijpass/diagnostics/capture.uc';
import { packetSummary, report } from '../../root/usr/lib/hijpass/diagnostics/report.uc';

let request = json(fs.stdin.read('all')), result;
switch (request.action) {
case 'read': result = read('hijpass', request.directory); break;
case 'firewall': result = firewall.generate(request.sections, request.state, fs.readfile(request.template)); break;
case 'plan': result = service.plan(request.sections); break;
case 'server-plan': result = service.serverPlan(request.sections); break;
case 'write': result = service.writeConfigs(request.sections, request.generated || render(request.sections)); break;
case 'normalize': result = rules.normalize(request.text, request.kind); break;
case 'contains': result = map(request.cases, pair => network.contains(pair[0], pair[1])); break;
case 'command': result = system.command(request.args); break;
case 'migrate':
	// UCI delta storage must be separate from config storage, otherwise libuci locks the same file twice.
	system.mkdir(request.directory + '/delta');
	migrate(cursor(request.directory, request.directory + '/delta')); result = read('hijpass', request.directory); break;
case 'arch': result = architecture(request.core, request.machine); break;
case 'trace-parse': result = parse(request.args); break;
case 'packet-summary': result = packetSummary(request.packets); break;
case 'trace-report': result = report(request.capture, request.directory, []); break;
default: die('unknown test operation');
}
printf('%J\n', result);
