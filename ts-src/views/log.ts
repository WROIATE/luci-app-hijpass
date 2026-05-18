import fs from "fs";
import view from "view";

import {LuciFlied} from "../enum/hijpass";
import form from "form";
import uci from "uci";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME),
            uci.load(LuciFlied.SERVER_CONF_NAME)
        ]);
    },
    handleSaveApply: null,
    handleReset: null,
    handleSave: null,
    render: function () {

        let m = new form.Map(LuciFlied.CONF_NAME, _('View Logs'),
            _('View and Manage Logs'));

        let s = m.section(form.TypedSection, 'logs_display');
        s.anonymous = true;
        s.addremove = false;
        s.render = function () {
            return createLogControlPanel();
        };

        return m.render();
    }
});

// 创建日志文件选项
function createLogFileOptions() {
    let options = [];

    let hijpassLog = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.CONF_NAME, 'log_path');
    // 添加系统日志
    options.push(E('option', {'value': hijpassLog}, _('Main Log')));

    // 添加分流日志
    let shuntLog = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'log_path');
    if (shuntLog) {
        options.push(E('option', {'value': shuntLog}, _('Shunt Log')));
    }

    // 动态添加代理节点日志
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (proxySection) => {
        let proxyName = proxySection['.name'];
        let displayName = proxySection.name || proxyName;
        let log_path = proxySection.log_path;

        if (log_path) {
            let optionText = _('Proxy Log') + ' - ' + displayName;
            options.push(E('option', {'value': log_path}, optionText));
        }
    });

    uci.sections(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE, (serverSection) => {
        let proxyName = serverSection['.name'];
        let displayName = serverSection.name || proxyName;
        let log_path = serverSection.log_path;

        if (log_path) {
            let optionText = _('Server Log') + ' - ' + displayName;
            options.push(E('option', {'value': log_path}, optionText));
        }
    });

    return options;
}

// 创建日志控制面板
function createLogControlPanel() {
    // 添加事件监听器
    requestAnimationFrame(function () {
        setupLogEventListeners();
        loadLogs(); // 初始加载日志
    });
    return E('div', {'class': 'cbi-section', 'style': 'display: flex;flex-direction: column;gap: 20px;'}, [
        E('div', {'class': 'cbi-section-node'}, [
            E('div', {'class': 'cbi-value'}, [
                E('label', {'class': 'cbi-value-title'}, _('Log File')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('select', {
                        'id': 'log-file-select',
                        'class': 'cbi-input-select',
                        'style': 'margin-right: 10px;'
                    }, createLogFileOptions())
                ])
            ]),
            E('div', {'class': 'cbi-value'}, [
                E('label', {'class': 'cbi-value-title'}, _('Log Level Filter')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('select', {
                        'id': 'log-level-filter',
                        'class': 'cbi-input-select',
                        'style': 'margin-right: 10px;'
                    }, [
                        E('option', {'value': ''}, _('All')),
                        E('option', {'value': 'DEBUG'}, _('Debug')),
                        E('option', {'value': 'INFO'}, _('Info')),
                        E('option', {'value': 'WARN'}, _('Warning')),
                        E('option', {'value': 'ERROR'}, _('Error'))
                    ])
                ])
            ]),
            E('div', {'class': 'cbi-value'}, [
                E('label', {'class': 'cbi-value-title'}, _('Display Lines')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('select', {
                        'id': 'log-lines-count',
                        'class': 'cbi-input-select',
                        'style': 'margin-right: 10px;'
                    }, [
                        E('option', {'value': '50'}, '50'),
                        E('option', {'value': '100', 'selected': 'selected'}, '100'),
                        E('option', {'value': '200'}, '200'),
                        E('option', {'value': '500'}, '500'),
                        E('option', {'value': '1000'}, '1000')
                    ])
                ])
            ]),
            E('div', {'class': 'cbi-value'}, [
                E('label', {'class': 'cbi-value-title'}, _('操作')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('button', {
                        'class': 'cbi-button cbi-button-action',
                        'id': 'refresh-logs',
                        'style': 'margin-right: 5px;'
                    }, _('Refresh')),
                    E('button', {
                        'class': 'cbi-button cbi-button-neutral',
                        'id': 'auto-refresh-toggle',
                        'style': 'margin-right: 5px;'
                    }, _('Auto Refresh')),
                    E('button', {
                        'class': 'cbi-button cbi-button-positive',
                        'id': 'download-logs',
                        'style': 'margin-right: 5px;'
                    }, _('Download')),
                    E('button', {
                        'class': 'cbi-button cbi-button-negative',
                        'id': 'clear-logs'
                    }, _('Clear'))
                ])
            ]),
            E('div', {'class': 'cbi-value'}, [
                E('div', {
                    'id': 'log-status',
                    'style': 'font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
                }),
                E('div', {
                    'id': 'log-content',
                    'class': 'log-display',
                    'style': 'width: 100%; height: 500px; font-family: monospace; font-size: 12px; background: #101010; color: #eee; border: 1px solid #ccc; padding: 10px; overflow: auto; white-space: pre; line-height: 1.4;'
                }, _('Log Content'))
            ])
        ])
    ]);
}

// 设置事件监听器
function setupLogEventListeners() {
    let autoRefreshInterval = null;
    let isAutoRefresh = false;

    // 刷新按钮
    document.getElementById('refresh-logs').addEventListener('click', function () {
        loadLogs();
    });

    // 自动刷新切换
    document.getElementById('auto-refresh-toggle').addEventListener('click', function () {
        isAutoRefresh = !isAutoRefresh;
        let button = this;

        if (isAutoRefresh) {
            button.textContent = _('Stop Auto Refresh');
            button.className = 'cbi-button cbi-button-negative';
            autoRefreshInterval = setInterval(loadLogs, 3000); // 每3秒刷新
            updateLogStatus(_('Auto Refresh Enabled'));
        } else {
            button.textContent = _('Auto Refresh');
            button.className = 'cbi-button cbi-button-neutral';
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
            updateLogStatus(_('Auto Refresh Disabled'));
        }
    });

    // 下载日志
    document.getElementById('download-logs').addEventListener('click', function () {
        downloadLogs();
    });

    // 清空日志
    document.getElementById('clear-logs').addEventListener('click', function () {
        if (confirm(_('Clear Log Confirmation'))) {
            clearLogs();
        }
    });

    // 日志文件选择变化
    document.getElementById('log-file-select').addEventListener('change', function () {
        loadLogs();
    });

    // 日志级别过滤变化
    document.getElementById('log-level-filter').addEventListener('change', function () {
        loadLogs();
    });

    // 显示行数变化
    document.getElementById('log-lines-count').addEventListener('change', function () {
        loadLogs();
    });
}

// 加载日志内容
function loadLogs() {
    let logFile = (document.getElementById('log-file-select') as HTMLInputElement).value;
    let levelFilter = (document.getElementById('log-level-filter') as HTMLInputElement).value;
    let linesCount = (document.getElementById('log-lines-count') as HTMLInputElement).value;

    updateLogStatus(_('Loading Logs'));

    fs.exec('/usr/bin/tail', ['-n', linesCount, logFile]).then(function (result) {
        let logContent = result.stdout || '';

        // 应用级别过滤
        if (levelFilter) {
            let lines = logContent.split('\n');
            let filteredLines = lines.filter(function (line) {
                let upperLine = line.toUpperCase();
                let upperFilter = levelFilter.toUpperCase();

                // 如果选择WARN，同时匹配WARN和WARNING
                if (upperFilter === 'WARN') {
                    return upperLine.includes('WARN') || upperLine.includes('WARNING');
                }

                return upperLine.includes(upperFilter);
            });
            logContent = filteredLines.join('\n');
        }

        // 添加颜色高亮
        logContent = highlightLogContent(logContent);

        let textarea = document.getElementById('log-content');
        textarea.innerHTML = logContent;

        // 滚动到底部
        textarea.scrollTop = textarea.scrollHeight;

        updateLogStatus(_('Log Updated') + ' - ' + new Date().toLocaleTimeString());
    }).catch(function (error) {
        updateLogStatus(_('Failed to Load Log') + error.message);
        document.getElementById('log-content').textContent = _('Failed to Load Log File') + logFile;
    });
}

// 高亮日志内容
function highlightLogContent(content) {
    // 转义HTML字符
    content = content.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 处理ANSI颜色代码
    content = convertAnsiToHtml(content);

    // 添加日志级别颜色高亮（如果没有ANSI颜色）
    // 匹配行开头的时间戳和日志级别（支持带/不带中括号）
    content = content.replace(/\s+\[?(ERROR|WARN|WARNING|INFO|DEBUG)\]?\s+/gmi, function (match, level) {
        if (match.includes('<span')) return match;
        let color = getLogLevelColor(level);
        return '<span style="color: ' + color + '; font-weight: bold;">' + match + '</span>';
    });

    return content;
}

// 获取日志级别对应的颜色
function getLogLevelColor(level) {
    switch (level.toUpperCase()) {
        case 'ERROR':
            return '#ff6b6b';
        case 'WARN':
        case 'WARNING':
            return '#ffa500';
        case 'INFO':
            return '#4ecdc4';
        case 'DEBUG':
            return '#95a5a6';
        default:
            return '#ffffff';
    }
}

// 将ANSI颜色代码转换为HTML
function convertAnsiToHtml(text) {
    // ANSI颜色代码映射表
    const ansiColorMap = {
        // 标准前景色
        '30': '#2e3436', // 黑色
        '31': '#cc0000', // 红色
        '32': '#4e9a06', // 绿色
        '33': '#c4a000', // 黄色
        '34': '#3465a4', // 蓝色
        '35': '#75507b', // 洋红
        '36': '#06989a', // 青色
        '37': '#d3d7cf', // 白色
        // 亮色前景色
        '90': '#555753', // 亮黑色（灰色）
        '91': '#ef2929', // 亮红色
        '92': '#8ae234', // 亮绿色
        '93': '#fce94f', // 亮黄色
        '94': '#729fcf', // 亮蓝色
        '95': '#ad7fa8', // 亮洋红
        '96': '#34e2e2', // 亮青色
        '97': '#eeeeec'  // 亮白色
    };

    // 背景色映射表
    const ansiBgColorMap = {
        '40': '#2e3436', // 黑色背景
        '41': '#cc0000', // 红色背景
        '42': '#4e9a06', // 绿色背景
        '43': '#c4a000', // 黄色背景
        '44': '#3465a4', // 蓝色背景
        '45': '#75507b', // 洋红背景
        '46': '#06989a', // 青色背景
        '47': '#d3d7cf', // 白色背景
        // 亮色背景
        '100': '#555753', // 亮黑色背景
        '101': '#ef2929', // 亮红色背景
        '102': '#8ae234', // 亮绿色背景
        '103': '#fce94f', // 亮黄色背景
        '104': '#729fcf', // 亮蓝色背景
        '105': '#ad7fa8', // 亮洋红背景
        '106': '#34e2e2', // 亮青色背景
        '107': '#eeeeec'  // 亮白色背景
    };

    let result = text;
    let openTags = [];

    // 处理ANSI转义序列
    result = result.replace(/\x1b\[([0-9;]*)m/g, function (match, codes) {
        if (!codes) codes = '0';

        let codeArray = codes.split(';');
        let html = '';

        for (let code of codeArray) {
            code = code.trim();

            if (code === '0' || code === '') {
                // 重置所有格式
                while (openTags.length > 0) {
                    html += '</span>';
                    openTags.pop();
                }
            } else if (code === '1') {
                // 粗体
                html += '<span style="font-weight: bold;">';
                openTags.push('bold');
            } else if (code === '4') {
                // 下划线
                html += '<span style="text-decoration: underline;">';
                openTags.push('underline');
            } else if (ansiColorMap[code]) {
                // 前景色
                html += '<span style="color: ' + ansiColorMap[code] + ';">';
                openTags.push('color');
            } else if (ansiBgColorMap[code]) {
                // 背景色
                html += '<span style="background-color: ' + ansiBgColorMap[code] + ';">';
                openTags.push('bgcolor');
            }
        }

        return html;
    });

    // 在文本末尾关闭所有未关闭的标签
    while (openTags.length > 0) {
        result += '</span>';
        openTags.pop();
    }

    return result;
}

// 下载日志
function downloadLogs() {
    let logFile = (document.getElementById('log-file-select') as HTMLInputElement).value;

    updateLogStatus(_('Preparing Download'));

    fs.read(logFile).then(function (content) {

        // 创建下载链接
        let blob = new Blob([content], {type: 'text/plain'});
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = logFile.split('/').pop() + '_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.log';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        updateLogStatus(_('Log Downloaded'));
    }).catch(function (error) {
        updateLogStatus(_('Download Failed') + error.message);
    });
}

// 清空日志
function clearLogs() {
    let logFile = (document.getElementById('log-file-select') as HTMLInputElement).value;

    updateLogStatus(_('Clearing Logs'));

    fs.write(logFile, '').then(function () {
        updateLogStatus(_('Log Cleared'));
        loadLogs(); // 重新加载显示空日志
    }).catch(function (error) {
        updateLogStatus(_('Clear Failed') + error.message);
    });
}

// 更新日志状态
function updateLogStatus(message) {
    let statusElement = document.getElementById('log-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = '#666';
    }
}

export default v;