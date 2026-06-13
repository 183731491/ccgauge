# Windows 部署说明

ccgauge 支持同时查看 WSL 和 Windows 上 Claude Code 的用量数据。

## 推荐方案：WSL 单实例（同时查看两环境）

WSL 可以通过 `/mnt/c/` 访问 Windows 文件系统。`ccgauge` 的 `--dir`
参数会**追加**一个额外扫描目录（不会替换默认目录），所以一个实例就能
同时扫描两个环境的数据。

```bash
# 在 WSL 中重启 ccgauge，追加 Windows Claude Code 数据目录
ccgauge restart -b --dir /mnt/c/Users/<username>/.claude

# 或者初次启动
ccgauge start -b --dir /mnt/c/Users/<username>/.claude
```

ccgauge 将同时扫描：

| 数据来源 | 路径 |
|---|---|
| WSL Claude Code | `~/.claude/projects` |
| Windows Claude Code | `/mnt/c/Users/<username>/.claude/projects` |

一个面板，两个环境的数据全部可见。

## 备选方案：Windows 原生安装

如果 WSL 不可用，可以在 Windows 原生运行 ccgauge。

### 构建 tgz（在 WSL/Linux 中）

```bash
pnpm build
npm pack
# 生成 ccgauge-1.1.2.tgz
cp ccgauge-1.1.2.tgz /mnt/d/
```

### Windows 安装

前置要求：Windows 上安装 Node.js 20+。

```powershell
npm i -g D:\ccgauge-1.1.2.tgz
```

### 运行

```powershell
# 后台模式（推荐）
ccgauge start -b

# 查看状态
ccgauge status

# 在浏览器中打开
ccgauge open

# 查看日志
ccgauge logs

# 停止
ccgauge stop
```

后台服务状态保存在 `~/.ccgauge/state.json`。

如果同时运行 WSL 和 Windows 两个实例，确保端口不同（如 WSL 用
`-p 10000`，Windows 用默认的 `3737`）。

## 构建注意事项

`scripts/postbuild.mjs` 在构建后会清理 Next.js standalone 中不需要的
文件以减小包体。**不要删除 `next/dist/compiled/babel`**：Next.js 15.5
的 devtools 在启动时需要 `babel/code-frame`
（`patch-error-inspect → shared.js`），删除会导致 Windows 上
报 `MODULE_NOT_FOUND` 错误。
