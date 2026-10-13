
import { run } from 'hijpass.common';
export function main() { run(() => {
    let action = shift(ARGV);
    if (action == 'error') return { success: false, error: ARGV[0] || 'operation failed' };
    die('unknown result action');
});
};
