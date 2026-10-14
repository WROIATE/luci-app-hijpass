#!/usr/bin/ucode -S
import { run } from 'hijpass.common';
// 此脚本仅供 Shell 输出错误对象，直接执行即可。
run(() => {
    let action = shift(ARGV);
    if (action == 'error') return { success: false, error: ARGV[0] || 'operation failed' };
    die('unknown result action');
});
