#!/usr/bin/ucode -S
import { prepare, finish } from 'hijpass.diagnostics.capture';
try {
	let action = shift(ARGV);
	if (action == 'prepare') { let pid = shift(ARGV); printf('%J\n', prepare(pid, ARGV)); }
	else if (action == 'finish') finish(ARGV[0]);
	else die('unknown capture configuration action');
}
catch (e) { warn(`error: ${e.message}\n`); exit(1); }
