#!/usr/bin/ucode -S
import * as fs from 'fs';
import * as tasks from 'hijpass.diagnostics.tasks';
try {
	let action = shift(ARGV);
	if (action == 'start') print(tasks.start(ARGV, fs.dirname(sourcepath()) + '/trace-worker.sh') + '\n');
	else if (action == 'status') printf('%J\n', tasks.status(ARGV[0]));
	else if (action == 'release') tasks.release(ARGV[0]);
	else die('Unknown trace task action');
}
catch (e) { warn(`${e.message}\n`); exit(1); }
