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

## 跨文件共享类型

把字段结构集中定义在 `types.uc`：

```ucode
/**
 * @typedef {{
 *   '.type': string,
 *   '.name': string|null,
 *   name: string|null,
 *   log_enabled: string|null
 * }} LogSection
 */
```

其他文件通过相对路径引用，可以直接写：

```ucode
/** @param {import('./types.uc').LogSection} section */
function logPath(section) {
    return section.log_enabled;
};
```

也可以声明一个简短的本地别名，在多个函数中复用：

```ucode
/** @typedef {import('./types.uc').LogSection} LogSection */

/** @param {LogSection} section */
function logPath(section) {
    return section.log_enabled;
};
```

在 `import()` 后的类型名或引用处的别名上按 F12，会定位到共享文件中的最终定义。共享文件只需注释，不需要创建或导出运行时对象。

路径相对当前引用所在的文件解析，支持 `./`、`../` 和省略 `.uc` 后缀（先尝试补上 `.uc`，再尝试原路径）。路径用 `/` 分隔，支持空格、中文以及多行 import 表达式。优先使用 VS Code 已打开的文档，未保存的共享类型修改立即参与跳转；别名链按每一层所在文件解析，循环链不返回目标。

普通类型名仍只在当前文件查找，跨文件必须显式写 `import()`，避免同名类型误匹配。裸模块名、内置模块、绝对路径、URL 和带转义字符的路径不参与解析。未命名文件支持本地类型导航，相对 import 需要先保存文件以确定目录。缺失文件或类型不返回目标。

本扩展提供类型导航，不提供字段校验，也不会抑制原 ucode-lsp 的诊断。ucode-lsp 0.8.11 尚不能从其他文件读取纯注释 typedef，因此跨文件写法即使可以跳转，原语言插件仍可能报告未知类型或无法推断字段。普通函数和变量的导航继续由原有语言插件提供。本扩展只处理 `.uc`，不处理 `.ut` 模板，也不从函数参数变量反推其类型定义。

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

实现依据：[import types 注释写法](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html#import-types)、[DefinitionProvider](https://code.visualstudio.com/api/references/vscode-api#DefinitionProvider)、[打开文档并复用编辑内容](https://code.visualstudio.com/api/references/vscode-api#workspace.openTextDocument)、[多个定义提供者的结果合并](https://code.visualstudio.com/api/references/vscode-api#languages.registerDefinitionProvider)、[扩展测试](https://code.visualstudio.com/api/working-with-extensions/testing-extension)、[VSIX 打包](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)。
