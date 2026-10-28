const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ucode-typedef-editor-'));
    const extensions = path.join(isolated, 'extensions');
    fs.mkdirSync(extensions);
    for (const directory of ['portable', 'cache', 'run']) {
        fs.mkdirSync(path.join(isolated, directory), { mode: 0o700 });
    }
    try {
        if (process.env.UCODE_LSP_EXTENSION) {
            fs.cpSync(process.env.UCODE_LSP_EXTENSION, path.join(extensions, 'noahbpeterson.ucode-lsp'), { recursive: true });
        }
        await runTests({
            version: '1.86.2',
            extensionDevelopmentPath: path.resolve(__dirname, '..'),
            extensionTestsPath: path.join(__dirname, 'editor.test.cjs'),
            extensionTestsEnv: {
                UCODE_TYPEDEF_TEST_DIR: isolated,
                VSCODE_PORTABLE: path.join(isolated, 'portable'),
                XDG_CACHE_HOME: path.join(isolated, 'cache'),
                XDG_RUNTIME_DIR: path.join(isolated, 'run'),
            },
            launchArgs: [
                '--user-data-dir', path.join(isolated, 'user'), '--extensions-dir', extensions,
                '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
                '--disable-gpu', '--no-sandbox',
            ],
        });
    } finally {
        fs.rmSync(isolated, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
