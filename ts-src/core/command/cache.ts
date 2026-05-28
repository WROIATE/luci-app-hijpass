// 编辑器内容缓存：以 cfgid 为键，sessionStorage 持久化 + 内存 Map 快速访问。
const memCache = new Map<string, string>()

export function cacheConf(cfgid: string, value: string): void {
    const v = value || ''
    sessionStorage.setItem(cfgid, v)
    memCache.set(cfgid, v)
}

export function getCachedConf(cfgid: string): string {
    return memCache.get(cfgid) ?? sessionStorage.getItem(cfgid) ?? ''
}
