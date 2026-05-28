// 编辑器内容缓存：sessionStorage 以 hash 为键存储内容，
// 内存 Map 记录 editorKey → hash，不写入 UCI 配置。
const keyToHash = new Map<string, string>()

function computeHash(str: string): string {
    let h = 0
    const s = str || ''
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i)
        h |= 0
    }
    return String(h)
}

export function cacheConf(key: string, value: string): void {
    const h = computeHash(value)
    sessionStorage.setItem(h, value || '')
    keyToHash.set(key, h)
}

export function getCachedConf(key: string): string {
    const h = keyToHash.get(key)
    if (!h) return ''
    return sessionStorage.getItem(h) || ''
}
