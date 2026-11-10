import baseclass from 'baseclass';
import uci from 'uci';
import ui from 'ui';
import request from 'request';
import session from 'session';
import type { Editor } from '../utils/backend';
import { DraftStore, FileDraft, normalizeFile } from '../utils/feature/config/drafts';

const sid: string = L.env.sessionid;
const store = new DraftStore(sid);
const changes = ui.changes;
const notice = (error: Error) => ui.addNotification(null, E('p', {}, error.message), 'error');
let uploaded: FileDraft[] = [];
let applying: Promise<void> | null = null;

async function transfer(action: 'session' | 'read' | 'check' | 'write', data: object = {}) {
    const response = await fetch((L.env.cgi_base || '/cgi-bin') + '/hijpass-editor?' + action, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sid },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok || result.error) {
        if (response.status === 403) await store.clear();
        throw Object.assign(new Error(result.error || _('Cannot access configuration file')), { status: response.status });
    }
    return result;
}

async function read(editor: Editor): Promise<string> {
    const draft = await store.get(editor);
    if (draft) {
        await transfer('session');
        return draft.content;
    }
    return normalizeFile((await transfer('read', { editor })).content);
}

async function save(editor: Editor, value: string, section: string, field: string) {
    await transfer('session');
    const content = normalizeFile(value);
    if (new Blob([content]).size > 16 * 1024 * 1024) throw new Error(_('Configuration file exceeds 16 MiB'));
    const previous = await store.get(editor);
    // 重命名节点时，比较新文件的内容；不能沿用原文件的基线。
    const original = previous && previous.editor.name === editor.name ? previous.original
        : normalizeFile((await transfer('read', { editor })).content);
    if (content === original) {
        if (previous) await store.remove(previous);
    } else {
        await store.put({ id: store.key(editor), editor, section, field, original, content,
            revision: Date.now() + ':' + Math.random() });
    }
    await refresh();
    channel?.postMessage('changed');
}

function hash(content: string) {
    let result = 0;
    for (let i = 0; i < content.length; i++) result = ((result << 5) - result + content.charCodeAt(i)) | 0;
    return String(result);
}

async function upload() {
    uploaded = [];
    const drafts = await store.list();
    if (!drafts.length) return;
    await transfer('session');
    // 全局应用可能发生在其他页面；重新读取同一 RPC session 的待提交 UCI。
    uci.unload('hijpass');
    await uci.load('hijpass');
    for (const draft of drafts) {
        const section = uci.get('hijpass', draft.section);
        if (!section || (['proxy_config', 'shunt_conf'].includes(draft.editor.resource) && section.config_type === 'tmpl')) {
            await store.remove(draft); continue;
        }
        if (draft.editor.resource === 'proxy_config') {
            const name = section.name || draft.section;
            if (name !== draft.editor.name) {
                draft.editor = { ...draft.editor, name };
                draft.original = '';
            }
        }
        await transfer('check', draft);
        uploaded.push(draft);
    }
    for (const draft of uploaded) {
        await transfer('write', draft);
        uci.set('hijpass', draft.section, draft.field, hash(draft.content));
    }
    await uci.save();
}

async function finish() {
    for (const draft of uploaded) await store.complete(draft);
    uploaded = [];
    await refresh();
    channel?.postMessage('changed');
}

function label(editor: Editor) {
    const names = { ip_direct: _('IP Direct List'), ip_proxy: _('IP Proxy List'),
        domain_direct: _('Domain Direct List'), domain_proxy: _('Domain Proxy List'),
        firewall_template: _('Firewall Template'), nft_hook: _('Firewall Hook'), dns_hook: _('DNS Hook'),
        shunt_conf: _('Edit Shunt Configuration File'), proxy_config: _('Proxy Configuration'), server_config: _('Server Configuration') };
    return names[editor.resource] + (editor.section ? ': ' + (editor.name || editor.section) : '');
}

async function showDrafts() {
    const drafts = await store.list();
    ui.showModal(_('Pending configuration files'), [
        E('ul', {}, drafts.map(draft => E('li', {}, label(draft.editor)))),
        E('div', { class: 'right' }, [
            E('button', { class: 'btn', click: ui.hideModal }, _('Close')), ' ',
            E('button', { class: 'btn cbi-button-reset', click: async () => {
                await store.clear(); channel?.postMessage('changed'); location.reload();
            } }, _('Discard file drafts')), ' ',
            E('button', { class: 'btn cbi-button-positive', click: () => changes.apply(true) }, _('Save & Apply')),
        ]),
    ]);
}

async function refresh() {
    const drafts = await store.list();
    if (drafts.length) ui.showIndicator('hijpass-files', _('Pending files: %d').format(String(drafts.length)), () => showDrafts().catch(notice));
    else ui.hideIndicator('hijpass-files');
}

// 不复制 LuCI 的确认、回滚和重连逻辑。只在用户确认后、原生应用 POST 发出前上传。
const nativeRequest = request.request;
const applyUrls = [L.url('admin/uci/apply_rollback'), L.url('admin/uci/apply_unchecked')];
request.request = function (url, options) {
    if (!applyUrls.includes(url) || options?.method?.toLowerCase() !== 'post') return nativeRequest.call(this, url, options);
    if (applying) return Promise.resolve({ status: 409, responseText: _('Configuration apply is already in progress') });
    applying = upload();
    return applying.then(() => nativeRequest.call(this, url, options)).then(async response => {
        // checked apply 返回 204 表示 UCI 无变化；文件可能已在上次重试中应用。
        if (response.status === 204 && url === applyUrls[0]) await finish();
        return response;
    }).catch(error => ({ status: 409, responseText: error.message })).finally(() => { applying = null; });
};
document.addEventListener('uci-applied', () => { finish().catch(notice); });
document.addEventListener('uci-reverted', () => { store.clear().then(refresh).then(() => channel?.postMessage('changed')).catch(notice); });
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hijpass-file-drafts:' + sid) : null;
if (channel) channel.onmessage = () => refresh().catch(notice);

// 新功能首次安装时，此 session 可能已缓存空的 preload 列表。
const preloads = session.getLocalData('preload');
if (Array.isArray(preloads) && !preloads.includes('preload.hijpass')) session.setLocalData('preload', [...preloads, 'preload.hijpass']);
async function initialize() {
    // 原生 session.list 不触碰其他会话的超时；只清理 rpcd 已销毁的会话草稿。
    const previous = (await store.sessions()).filter(value => value !== sid);
    if (previous.length) {
        const result = await transfer('session', { sessions: previous });
        for (const id of previous) if (!result.sessions.includes(id)) await store.clear(id);
    }
    if ((await store.list()).length) await transfer('session');
    await refresh();
}
if (L.loaded) initialize().catch(notice);
else document.addEventListener('luci-loaded', () => { initialize().catch(notice); }, { once: true });

export default baseclass.extend({ read, save }) as { read: typeof read; save: typeof save };
