# ucode Typedef Navigation

独立的 `.uc` 注释类型导航插件，不需要安装 ucode Language Support，也可与它一起使用。运行时无额外依赖，生成的 VSIX 可复制到其他机器直接安装。

## 安装和使用

1. 在 VS Code 命令面板执行 **Extensions: Install from VSIX...**，选择本目录生成的 `.vsix`。
2. Remote SSH / WSL 环境中安装到打开 ucode 项目的远端扩展宿主。
3. 打开 `.uc` 文件，将光标放在 `@param {NodeSection}` 的 `NodeSection` 上，按 **F12**，或使用“转到定义”。也支持 Ctrl+单击（macOS 为 Cmd+单击）和“查看定义”。

```ucode
/**
 * @typedef {{
 *   '.name': string,
 *   name: string|null
 * }} NodeSection
 */

/** @param {NodeSection} section */
function nodeFilename(section) {
    return section.name || section['.name'];
};
```

支持 `@param`、`@returns`、`@type`、`@property` 和 `@typedef` 类型表达式中的名称，包括联合、数组、泛型和嵌套对象；支持 `@typedef {Type} Name` 与 `@typedef Name {Type}` 两种写法。编辑后无需保存即可跳转。重复定义会交给 VS Code 显示多个候选。

类型按当前文件解析，与 ucode-lsp 的文件级 typedef 作用域一致。不扫描其他文件中的同名类型；不解析 `import('module').Type`，也不从函数参数变量反推其类型定义。普通函数和变量的导航继续由原有语言插件提供。本扩展只处理 `.uc`，不处理 `.ut` 模板。

## 开发和验证

使用 Node.js 22 或更新版本：

```sh
npm ci
npm test
npm run test:editor
npm run package
```

`test:editor` 使用独立的 VS Code 1.86.2 测试宿主。Linux 无桌面环境时执行 `xvfb-run -a npm run test:editor`。可设置 `UCODE_LSP_EXTENSION` 为现有 ucode-lsp 扩展目录，进行两个扩展并存的集成验证；只会复制到隔离测试目录。

打包工具的传递依赖 MSAL Node 固定为修复了 [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5) 的 7.1.2。本项目只验证本地 VSIX 打包，不使用 Marketplace 登录或发布；所有开发依赖均不进入 VSIX。

实现依据：[DefinitionProvider](https://code.visualstudio.com/api/references/vscode-api#DefinitionProvider)、[多个定义提供者的结果合并](https://code.visualstudio.com/api/references/vscode-api#languages.registerDefinitionProvider)、[扩展测试](https://code.visualstudio.com/api/working-with-extensions/testing-extension)、[VSIX 打包](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)。
