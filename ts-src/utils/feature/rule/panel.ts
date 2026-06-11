import fs from "fs";

function updateRuleFile() {
    updateUpdateStatus('正在更新规则...');
    fs.exec('/usr/lib/hijpass/rules.sh', ['update'])
        .then(function (result) {
            if (result.code === 0) {
                updateUpdateStatus('规则文件更新成功！');
            } else {
                updateUpdateStatus('规则文件更新失败: ' + (result.stderr || result.stdout));
            }
        })
        .catch(function (error) {
            updateUpdateStatus('更新过程中发生错误：' + error.message);
        });
}

function setupUpdateListeners() {
    let reloadBtn = document.getElementById('update-rule');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', function () {
            updateRuleFile();
        });
    }
}

function updateUpdateStatus(message: string) {
    let statusElement = document.getElementById('update-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('成功') ? '#4caf50' :
            message.includes('失败') ? '#f44336' : '#666';
    }
}

function setupQueryListeners() {
    let queryBtn = document.getElementById('query-btn');
    let keywordInput = document.getElementById('query-keyword');

    if (queryBtn) {
        queryBtn.addEventListener('click', function () {
            performQuery();
        });
    }

    if (keywordInput) {
        keywordInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                performQuery();
            }
        });
    }
}

function performQuery() {
    let keyword = (document.getElementById('query-keyword') as HTMLInputElement).value.trim();
    let queryType = (document.getElementById('query-type') as HTMLSelectElement).value;
    let statusElement = document.getElementById('query-status');
    let outputElement = document.getElementById('query-output');

    if (!keyword) {
        if (statusElement) {
            statusElement.textContent = _('Enter Query Keyword');
            statusElement.style.color = '#f44336';
        }
        return;
    }

    if (statusElement) {
        statusElement.textContent = _('Querying');
        statusElement.style.color = '#666';
    }

    switch (queryType) {
        case 'domain':
            queryDomain(keyword, outputElement, statusElement);
            break;
        case 'geosite':
            queryGeoTag(keyword, 'geosite', outputElement, statusElement);
            break;
        case 'shunt':
            queryShunt(keyword, outputElement, statusElement);
            break;
        default:
            if (statusElement) {
                statusElement.textContent = _('Unknown Query Type');
                statusElement.style.color = '#f44336';
            }
    }
}

function queryDomain(keyword: string, outputElement, statusElement) {
    clearQuery()
    fs.exec('/usr/lib/hijpass/geoview.sh', ['-l', 'geosite', keyword])
        .then(setOutput(outputElement, statusElement, '# geosite\n'))
        .catch(setError(statusElement))
    fs.exec('/usr/lib/hijpass/rules.sh', ['query', keyword])
        .then(setOutput(outputElement, statusElement, '# 本地规则文件\n'))
        .catch(setError(statusElement));
}

function queryShunt(keyword: string, outputElement, statusElement) {
    clearQuery()
    fs.exec('/usr/lib/hijpass/route-match.sh', [keyword])
        .then(setOutput(outputElement, statusElement, '# 分流规则\n'))
        .catch(setError(statusElement))
}

function queryGeoTag(keyword, geoType, outputElement, statusElement) {
    clearQuery()
    fs.exec_direct('/usr/lib/hijpass/geoview.sh', ['-e', geoType, keyword])
        .then(function (result) {
            if (result) {
                if (outputElement) {
                    if (outputElement.value) {
                        outputElement.value += '\n';
                    }
                    outputElement.value += '# ' + geoType + '\n';
                    outputElement.value += result;
                }
                if (statusElement) {
                    statusElement.textContent = _('Query Complete');
                    statusElement.style.color = '#4caf50';
                }
            } else {
                throw new Error(result.stderr || '查询失败');
            }
        })
        .catch(setError(statusElement));
}

function clearQuery() {
    (document.getElementById('query-output') as HTMLTextAreaElement).value = '';
}

function setOutput(outputElement: HTMLTextAreaElement, statusElement, comment: string) {
    return function (result: any) {
        if (result.code === 0) {
            if (outputElement && result.stdout) {
                if (outputElement.value) {
                    outputElement.value += '\n';
                }
                outputElement.value += comment;
                outputElement.value += result.stdout;
            }
            if (statusElement) {
                statusElement.textContent = _('Query Complete');
                statusElement.style.color = '#4caf50';
            }
        } else {
            throw new Error(result.stderr || '查询失败');
        }
    }
}

function setError(statusElement) {
    return function (error) {
        console.log(error)
        statusElement.textContent = _('Query Failed');
        statusElement.style.color = '#f44336';
    }
}

const RulePanelUtils = {
    createUpdateButtons: function () {
        let view = E('div', {'class': 'cbi-section'}, [
            E('div', {'class': 'cbi-section-node'}, [
                E('div', {'class': 'cbi-value'}, [
                    E('label', {'class': 'cbi-value-title'}, _('Rule Update')),
                    E('div', {'class': 'cbi-value-field'}, [
                        E('button', {
                            'class': 'cbi-button cbi-button-neutral',
                            'id': 'update-rule',
                            'style': 'margin-right: 10px;'
                        }, _('Update Rule Files')),
                        E('span', {
                            'id': 'update-status',
                            'style': 'margin-left: 10px; font-size: 12px; color: #666;'
                        })
                    ])
                ])
            ])
        ]);
        requestAnimationFrame(function () {
            setupUpdateListeners();
        });
        return view
    },

    createQueryPanel: function () {
        let view = E('div', {'class': 'cbi-section'}, [
            E('div', {'class': 'cbi-section-node'}, [
                E('div', {'class': 'cbi-value', 'style': 'margin-bottom: 20px;'}, [
                    E('label', {'class': 'cbi-value-title'}, _('Query Type')),
                    E('div', {'class': 'cbi-value-field'}, [
                        E('select', {
                            'id': 'query-type',
                            'class': 'cbi-input-select',
                            'style': 'width: 200px; margin-right: 10px;'
                        }, [
                            E('option', {'value': 'domain'}, _('Domain Query')),
                            E('option', {'value': 'geosite'}, _('GeoSite')),
                            E('option', {'value': 'shunt'}, _('Shunt Query')),
                        ])
                    ])
                ]),
                E('div', {'class': 'cbi-value', 'style': 'margin-bottom: 20px;'}, [
                    E('label', {'class': 'cbi-value-title'}, _('Query Keyword')),
                    E('div', {'class': 'cbi-value-field'}, [
                        E('input', {
                            'type': 'text',
                            'id': 'query-keyword',
                            'class': 'cbi-input-text',
                            'placeholder': _('Enter Domain or GeoSite Tag'),
                            'style': 'margin-right: 10px;'
                        }),
                        E('button', {
                            'class': 'cbi-button cbi-button-action',
                            'id': 'query-btn',
                            'style': 'margin-right: 10px;'
                        }, _('Query')),
                        E('span', {
                            'id': 'query-status',
                            'style': 'margin-left: 10px; font-size: 12px; color: #666;'
                        })
                    ])
                ]),
                E('div', {'class': 'cbi-value'}, [
                    E('label', {'class': 'cbi-value-title', 'style': 'visibility: hidden'}, _('Query Results')),
                    E('div', {'class': 'cbi-value-field'}, [
                        E('textarea', {
                            'id': 'query-output',
                            'class': 'cbi-input-textarea',
                            'readonly': 'readonly',
                            'style': 'width: 100%; height: 300px;'
                        })
                    ])
                ])
            ])
        ]);

        requestAnimationFrame(function () {
            setupQueryListeners();
        });

        return view;
    },
}

export { RulePanelUtils }
