/** @typedef {import('../types/config.uc').UciSection} UciSection */
// Section：.name 是稳定 ID，.type 是配置段类型，.index 是可选排序位置。
// 普通字段是字符串或字符串数组；输入可来自原生 UCI，也可来自 LuCI JSON 快照。
// 本模块只查询与校验内存数据，不读写配置文件。
/**
 * 按类型筛选 UCI section，保持原配置顺序。
 * @param {UciSection[]} sections
 * @param {string} kind
 * @returns {UciSection[]} 匹配的原对象数组；无匹配时为空数组。
 */
export function of(sections, kind) {
	return filter(sections, s => s['.type'] == kind);
};
/**
 * 查找指定类型的第一个 UCI section。
 * @param {UciSection[]} sections
 * @param {string} kind
 * @returns {UciSection|object} 原 section 对象；缺失时为新的空对象。
 */
export function first(sections, kind) {
	return of(sections, kind)[0] || {};
};

// 校验快照结构，防止外部 JSON 的数字/对象进入只接受 UCI 字符串的业务转换。
/**
 * 检查配置快照的结构、section 标识和字段类型。
 * @param {UciSection[]} sections
 * @returns {null} 无业务返回值；结构无效时抛错。
 */
export function validateSections(sections) {
	if (type(sections) != 'array' || !length(sections)) {
		die('configuration is empty or cannot unmarshal sections array');
	}
	let ids = {};
	for (let s in sections) {
		if (type(s) != 'object' || !s['.name'] || !s['.type']) {
			die('section requires .name and .type');
		}
		if (ids[s['.name']]) {
			die(`duplicate section "${s['.name']}"`);
		}
		ids[s['.name']] = true;
		for (let key, value in s) {
			if (substr(key, 0, 1) == '.') {
				continue;
			}
			if (type(value) == 'string') {
				continue;
			}
			if (type(value) == 'array' && !length(filter(value, v => type(v) != 'string'))) {
				continue;
			}
			die(`${s['.name']}: ${key} must be a string or string list`);
		}
	}
};
