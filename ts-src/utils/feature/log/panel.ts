import fs from "fs";
import uci from "uci";
import { LuciFlied } from "../../../enum/hijpass";

function createLogFileOptions() {
    let options = [];

    let hijpassLog = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.CONF_NAME, 'log_path');
    options.push(E('option', {'value': hijpassLog}, _('Main Log')));

    let shuntLog = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'log_path');
    if (shuntLog) {
        options.push(E('option', {'value': shuntLog}, _('Shunt Log')));
    }

    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (proxySection) => {
        let proxyName = proxySection['.name'];
        let displayName = proxySection.name || proxyName;
        let log_path = proxySection.log_path;

        if (log_path) {
            options.push(E('option', {'value': log_path}, _('Proxy Log') + ' - ' + displayName));
        }
    });

    uci.sections(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE, (serverSection) => {
        let proxyName = serverSection['.name'];
        let displayName = serverSection.name || proxyName;
        let log_path = serverSection.log_path;

        if (log_path) {
            options.push(E('option', {'value': log_path}, _('Server Log') + ' - ' + displayName));
        }
    });

    return options;
}

function setupLogEventListeners() {
    let autoRefreshInterval = null;
    let isAutoRefresh = false;

    document.getElementById('refresh-logs').addEventListener('click', function () {
        loadLogs();
    });

    document.getElementById('auto-refresh-toggle').addEventListener('click', function () {
        isAutoRefresh = !isAutoRefresh;
        let button = this;

        if (isAutoRefresh) {
            button.textContent = _('Stop Auto Refresh');
            button.className = 'cbi-button cbi-button-negative';
            autoRefreshInterval = setInterval(loadLogs, 3000);
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

    document.getElementById('download-logs').addEventListener('click', function () {
        downloadLogs();
    });

    document.getElementById('clear-logs').addEventListener('click', function () {
        if (confirm(_('Clear Log Confirmation'))) {
            clearLogs();
        }
    });

    document.getElementById('log-file-select').addEventListener('change', function () {
        loadLogs();
    });

    document.getElementById('log-level-filter').addEventListener('change', function () {
        loadLogs();
    });

    document.getElementById('log-lines-count').addEventListener('change', function () {
        loadLogs();
    });
}

function loadLogs() {
    let logFile = (document.getElementById('log-file-select') as HTMLInputElement).value;
    let levelFilter = (document.getElementById('log-level-filter') as HTMLInputElement).value;
    let linesCount = (document.getElementById('log-lines-count') as HTMLInputElement).value;

    updateLogStatus(_('Loading Logs'));

    fs.exec('/usr/bin/tail', ['-n', linesCount, logFile]).then(function (result) {
        let logContent = result.stdout || '';

        if (levelFilter) {
            let upperFilter = levelFilter.toUpperCase();
            let filteredLines = logContent.split('\n').filter(function (line) {
                let upperLine = line.toUpperCase();
                if (upperFilter === 'WARN') {
                    return upperLine.includes('WARN') || upperLine.includes('WARNING');
                }

                return upperLine.includes(upperFilter);
            });
            logContent = filteredLines.join('\n');
        }

        logContent = highlightLogContent(logContent);

        let textarea = document.getElementById('log-content');
        textarea.innerHTML = logContent;
        textarea.scrollTop = textarea.scrollHeight;

        updateLogStatus(_('Log Updated') + ' - ' + new Date().toLocaleTimeString());
    }).catch(function (error) {
        updateLogStatus(_('Failed to Load Log') + error.message);
        document.getElementById('log-content').textContent = _('Failed to Load Log File') + logFile;
    });
}

function highlightLogContent(content) {
    content = content.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    content = convertAnsiToHtml(content);

    content = content.replace(/\s+\[?(ERROR|WARN|WARNING|INFO|DEBUG)\]?\s+/gmi, function (match, level) {
        if (match.includes('<span')) return match;
        let color = getLogLevelColor(level);
        return '<span style="color: ' + color + '; font-weight: bold;">' + match + '</span>';
    });

    return content;
}

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

function convertAnsiToHtml(text) {
    const ansiColorMap = {
        '30': '#2e3436',
        '31': '#cc0000',
        '32': '#4e9a06',
        '33': '#c4a000',
        '34': '#3465a4',
        '35': '#75507b',
        '36': '#06989a',
        '37': '#d3d7cf',
        '90': '#555753',
        '91': '#ef2929',
        '92': '#8ae234',
        '93': '#fce94f',
        '94': '#729fcf',
        '95': '#ad7fa8',
        '96': '#34e2e2',
        '97': '#eeeeec'
    };

    const ansiBgColorMap = {
        '40': '#2e3436',
        '41': '#cc0000',
        '42': '#4e9a06',
        '43': '#c4a000',
        '44': '#3465a4',
        '45': '#75507b',
        '46': '#06989a',
        '47': '#d3d7cf',
        '100': '#555753',
        '101': '#ef2929',
        '102': '#8ae234',
        '103': '#fce94f',
        '104': '#729fcf',
        '105': '#ad7fa8',
        '106': '#34e2e2',
        '107': '#eeeeec'
    };

    let result = text;
    let openTags = [];

    result = result.replace(/\x1b\[([0-9;]*)m/g, function (match, codes) {
        if (!codes) codes = '0';

        let codeArray = codes.split(';');
        let html = '';

        for (let code of codeArray) {
            code = code.trim();

            if (code === '0' || code === '') {
                while (openTags.length > 0) {
                    html += '</span>';
                    openTags.pop();
                }
            } else if (code === '1') {
                html += '<span style="font-weight: bold;">';
                openTags.push('bold');
            } else if (code === '4') {
                html += '<span style="text-decoration: underline;">';
                openTags.push('underline');
            } else if (ansiColorMap[code]) {
                html += '<span style="color: ' + ansiColorMap[code] + ';">';
                openTags.push('color');
            } else if (ansiBgColorMap[code]) {
                html += '<span style="background-color: ' + ansiBgColorMap[code] + ';">';
                openTags.push('bgcolor');
            }
        }

        return html;
    });

    while (openTags.length > 0) {
        result += '</span>';
        openTags.pop();
    }

    return result;
}

function downloadLogs() {
    let logFile = (document.getElementById('log-file-select') as HTMLInputElement).value;

    updateLogStatus(_('Preparing Download'));

    fs.read(logFile).then(function (content) {
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

function clearLogs() {
    let logFile = (document.getElementById('log-file-select') as HTMLInputElement).value;

    updateLogStatus(_('Clearing Logs'));

    fs.write(logFile, '').then(function () {
        updateLogStatus(_('Log Cleared'));
        loadLogs();
    }).catch(function (error) {
        updateLogStatus(_('Clear Failed') + error.message);
    });
}

function updateLogStatus(message) {
    let statusElement = document.getElementById('log-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = '#666';
    }
}

const LogPanelUtils = {
    createLogControlPanel: function () {
        requestAnimationFrame(function () {
            setupLogEventListeners();
            loadLogs();
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
    },
}

export { LogPanelUtils }
