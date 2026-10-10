import { cursor } from 'uci';

// Section 是原生 UCI section 对象：.name 为稳定 ID，.type 为配置段类型，
// .index 为排序位置；其余 option 为字符串，list 为字符串数组。
// LuCI 的待保存快照与 cursor.foreach() 的结果使用相同结构。
export function read(packageName, directory) {
	let ctx = cursor(directory);
	let sections = [];
	if (!ctx.load(packageName || 'hijpass'))
		die(`cannot load UCI ${packageName || 'hijpass'}: ${ctx.error()}`);
	ctx.foreach(packageName || 'hijpass', null, section => push(sections, section));
	return sections;
};

export function of(sections, kind) {
	return filter(sections, s => s['.type'] == kind);
};

export function first(sections, kind) {
	return of(sections, kind)[0] || {};
};

export function list(value) {
	return type(value) == 'array' ? value : value ? [value] : [];
};

export function validate(sections) {
	if (type(sections) != 'array' || !length(sections))
		die('configuration is empty or cannot unmarshal sections array');
	let ids = {};
	for (let s in sections) {
		if (type(s) != 'object' || !s['.name'] || !s['.type'])
			die('section requires .name and .type');
		if (ids[s['.name']]) die(`duplicate section "${s['.name']}"`);
		ids[s['.name']] = true;
		for (let key, value in s) {
			if (substr(key, 0, 1) == '.') continue;
			if (type(value) == 'string') continue;
			if (type(value) == 'array' && !length(filter(value, v => type(v) != 'string'))) continue;
			die(`${s['.name']}: ${key} must be a string or string list`);
		}
	}
};

export function port(value) {
	if (type(value) != 'string' || !match(value, /^[0-9]+$/) || int(value) < 1 || int(value) > 65535)
		die(`invalid port "${value}"`);
	return int(value);
};

// 校验时长并按需换算成秒（例如 Xray gRPC）；其它核心字段保留 UCI 原字符串。
export function duration(value) {
	if (value == '' || value == '0') return 0;
	let remaining = value, seconds = 0;
	const units = { ns: 1e-9, us: 1e-6, 'µs': 1e-6, ms: 0.001, s: 1, m: 60, h: 3600 };
	while (length(remaining)) {
		let m = match(remaining, /^([0-9]+([.][0-9]*)?|[.][0-9]+)(ns|us|µs|ms|s|m|h)/);
		if (!m) die(`invalid duration "${value}"`);
		seconds += +m[1] * units[m[3]];
		remaining = substr(remaining, length(m[0]));
	}
	if (seconds > 9223372036) die('duration out of range');
	return seconds;
};

// 字段声明格式：option: [类型, 默认值, 最大值（可选）]。
// 只解码当前协议声明的字段，残留的其它协议字段不会误触发校验或进入输出。
export function decode(section, declarations) {
	let result = {};
	for (let key, spec in declarations) {
		let value = section[key];
		if (value == null) { result[key] = spec[1]; continue; }
		if (spec[0] == 'list') { result[key] = list(value); continue; }
		if (type(value) != 'string') die(`${key} must be a string`);
		switch (spec[0]) {
		case 'text': result[key] = value; break;
		case 'port': result[key] = value ? port(value) : 0; break;
		case 'bool':
			if (value != '' && value != '0' && value != '1') die(`invalid UCI boolean "${value}"`);
			result[key] = value == '1'; break;
		case 'duration': duration(value); result[key] = value; break;
		case 'integer':
			if (value && !match(value, /^[+]?[0-9]+$/)) die(`invalid nonnegative integer "${value}"`);
			result[key] = value ? int(value) : 0;
			if (result[key] < 0 || result[key] > (spec[2] || 9223372036854775807)) die(`${key}: numeric option out of range`);
			break;
		case 'number':
			if (value && !match(value, /^[+]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$/)) die(`invalid number "${value}"`);
			result[key] = value ? +value : 0;
			if (result[key] != result[key] || result[key] < 0 || result[key] > 1.7976931348623157e308) die(`${key}: invalid number`);
			break;
		}
	}
	return result;
};
