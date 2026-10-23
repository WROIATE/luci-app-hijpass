#!/usr/bin/ucode -S
import * as fs from 'fs';
import { run, text } from 'hijpass.common';

/**
 * @param {string} directory Shell 采集的输出目录。
 * @param {integer} code 命令退出码。
 * @returns {{code: integer, stdout: string, stderr: string}} 命令结果：code 为真实退出码，stdout/stderr 为原始输出，仅移除末尾换行。
 */
function commandOutput(directory, code) {
    // 保持原 Shell 命令替换的行为：只移除末尾换行，不修剪其它空白。
    return {
        code,
        stdout: rtrim(text(directory + '/stdout'), '\n'),
        stderr: rtrim(text(directory + '/stderr'), '\n'),
    };
}

// Shell 只传目录、退出码或短错误；大文本由 ucode 直接读取并编码为 JSON。
run(() => {
    let action = shift(ARGV);
    if (action == 'error' || action == 'error-file') {
        let message = action == 'error-file' ? rtrim(text(ARGV[0]), '\n') : ARGV[0];
        return { success: false, error: message || 'operation failed' };
    }
    if (action == 'output' || action == 'job') {
        let directory = ARGV[0];
        if (type(directory) != 'string') die('missing result directory');
        if (action == 'job' && !fs.stat(directory + '/exit')) return { running: true };
        let code = int(action == 'job' ? text(directory + '/exit') : ARGV[1]);
        if (type(code) != 'int' || code < 0 || code > 255) die('invalid command exit code');
        let output = commandOutput(directory, code);
        return action == 'job' ? { running: false, ...output } : output;
    }
    die('unknown result action');
}, true);
