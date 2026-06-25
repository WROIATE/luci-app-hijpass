import fs from "fs";

type RuleUpdateStatus = 'success' | 'error' | 'neutral';

function updateRuleFile(statusElement: HTMLElement) {
    updateUpdateStatus(statusElement, _('Updating Rule Files'), 'neutral');
    fs.exec('/usr/lib/hijpass/rules.sh', ['update'])
        .then(function (result) {
            if (result.code === 0) {
                updateUpdateStatus(statusElement, _('Rule Files Updated'), 'success');
            } else {
                updateUpdateStatus(statusElement, _('Rule File Update Failed: %s').format(result.stderr || result.stdout), 'error');
            }
        })
        .catch(function (error) {
            updateUpdateStatus(statusElement, _('Error occurred while updating: %s').format(error.message), 'error');
        });
}

function updateUpdateStatus(statusElement: HTMLElement, message: string, status: RuleUpdateStatus) {
    statusElement.textContent = message;
    statusElement.style.color = status === 'success' ? '#4caf50' :
        status === 'error' ? '#f44336' : '#666';
}

function performQuery(
    keywordInput: HTMLInputElement,
    queryTypeSelect: HTMLSelectElement,
    statusElement: HTMLElement,
    outputElement: HTMLTextAreaElement
) {
    let keyword = keywordInput.value.trim();
    let queryType = queryTypeSelect.value;

    if (!keyword) {
        statusElement.textContent = _('Enter Query Keyword');
        statusElement.style.color = '#f44336';
        return;
    }

    statusElement.textContent = _('Querying');
    statusElement.style.color = '#666';

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
            statusElement.textContent = _('Unknown Query Type');
            statusElement.style.color = '#f44336';
    }
}

function queryDomain(keyword: string, outputElement: HTMLTextAreaElement, statusElement: HTMLElement) {
    clearQuery(outputElement)
    fs.exec('/usr/lib/hijpass/geoview.sh', ['-l', 'geosite', keyword])
        .then(setOutput(outputElement, statusElement, '# geosite\n'))
        .catch(setError(statusElement))
    fs.exec('/usr/lib/hijpass/rules.sh', ['query', keyword])
        .then(setOutput(outputElement, statusElement, _('# Local Rule Files\n')))
        .catch(setError(statusElement));
}

function queryShunt(keyword: string, outputElement: HTMLTextAreaElement, statusElement: HTMLElement) {
    clearQuery(outputElement)
    fs.exec('/usr/lib/hijpass/route-match.sh', [keyword])
        .then(setOutput(outputElement, statusElement, _('# Shunt Rules\n')))
        .catch(setError(statusElement))
}

function queryGeoTag(keyword: string, geoType: string, outputElement: HTMLTextAreaElement, statusElement: HTMLElement) {
    clearQuery(outputElement)
    fs.exec_direct('/usr/lib/hijpass/geoview.sh', ['-e', geoType, keyword])
        .then(function (result) {
            if (result) {
                if (outputElement.value) {
                    outputElement.value += '\n';
                }
                outputElement.value += '# ' + geoType + '\n';
                outputElement.value += result;
                statusElement.textContent = _('Query Complete');
                statusElement.style.color = '#4caf50';
            } else {
                throw new Error(result.stderr || _('Query Failed'));
            }
        })
        .catch(setError(statusElement));
}

function clearQuery(outputElement: HTMLTextAreaElement) {
    outputElement.value = '';
}

function setOutput(outputElement: HTMLTextAreaElement, statusElement: HTMLElement, comment: string) {
    return function (result: any) {
        if (result.code === 0) {
            if (result.stdout) {
                if (outputElement.value) {
                    outputElement.value += '\n';
                }
                outputElement.value += comment;
                outputElement.value += result.stdout;
            }
            statusElement.textContent = _('Query Complete');
            statusElement.style.color = '#4caf50';
        } else {
            throw new Error(result.stderr || _('Query Failed'));
        }
    }
}

function setError(statusElement: HTMLElement) {
    return function (error) {
        console.log(error)
        statusElement.textContent = _('Query Failed');
        statusElement.style.color = '#f44336';
    }
}

const RulePanelUtils = {
    createUpdateButtons: function () {
        const statusElement = E('span', {
            'style': 'margin-left: 10px; font-size: 12px; color: #666;'
        }) as HTMLElement;

        return E('div', {'class': 'cbi-section'}, [
            E('div', {'class': 'cbi-section-node'}, [
                E('div', {'class': 'cbi-value'}, [
                    E('label', {'class': 'cbi-value-title'}, _('Rule Update')),
                    E('div', {'class': 'cbi-value-field'}, [
                        E('button', {
                            'class': 'cbi-button cbi-button-neutral',
                            'style': 'margin-right: 10px;',
                            'type': 'button',
                            'click': function (ev: Event) {
                                ev.preventDefault();
                                updateRuleFile(statusElement);
                            }
                        }, _('Update Rule Files')),
                        statusElement
                    ])
                ])
            ])
        ]);
    },

    createQueryPanel: function () {
        const queryTypeSelect = E('select', {
            'class': 'cbi-input-select',
            'style': 'width: 200px; margin-right: 10px;'
        }, [
            E('option', {'value': 'domain'}, _('Domain Query')),
            E('option', {'value': 'geosite'}, _('GeoSite')),
            E('option', {'value': 'shunt'}, _('Shunt Query')),
        ]) as HTMLSelectElement;
        const keywordInput = E('input', {
            'type': 'text',
            'class': 'cbi-input-text',
            'placeholder': _('Enter Domain or GeoSite Tag'),
            'style': 'margin-right: 10px;',
            'keydown': function (ev: KeyboardEvent) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    performQuery(keywordInput, queryTypeSelect, statusElement, outputElement);
                }
            }
        }) as HTMLInputElement;
        const statusElement = E('span', {
            'style': 'margin-left: 10px; font-size: 12px; color: #666;'
        }) as HTMLElement;
        const outputElement = E('textarea', {
            'class': 'cbi-input-textarea',
            'readonly': 'readonly',
            'style': 'width: 100%; height: 300px;'
        }) as HTMLTextAreaElement;

        return E('div', {'class': 'cbi-section'}, [
            E('div', {'class': 'cbi-section-node'}, [
                E('div', {'class': 'cbi-value', 'style': 'margin-bottom: 20px;'}, [
                    E('label', {'class': 'cbi-value-title'}, _('Query Type')),
                    E('div', {'class': 'cbi-value-field'}, [queryTypeSelect])
                ]),
                E('div', {'class': 'cbi-value', 'style': 'margin-bottom: 20px;'}, [
                    E('label', {'class': 'cbi-value-title'}, _('Query Keyword')),
                    E('div', {'class': 'cbi-value-field'}, [
                        keywordInput,
                        E('button', {
                            'class': 'cbi-button cbi-button-action',
                            'style': 'margin-right: 10px;',
                            'type': 'button',
                            'click': function (ev: Event) {
                                ev.preventDefault();
                                performQuery(keywordInput, queryTypeSelect, statusElement, outputElement);
                            }
                        }, _('Query')),
                        statusElement
                    ])
                ]),
                E('div', {'class': 'cbi-value'}, [
                    E('label', {'class': 'cbi-value-title', 'style': 'visibility: hidden'}, _('Query Results')),
                    E('div', {'class': 'cbi-value-field'}, [outputElement])
                ])
            ])
        ]);
    },
}

export { RulePanelUtils }
