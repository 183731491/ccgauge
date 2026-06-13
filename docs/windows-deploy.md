# Windows 部署说明

ccgauge 支持同时查看 WSL 和 Windows 上 Claude Code 的用量数据。
以下是从零开始在 WSL 和 Windows 上部署的完整步骤。

---

## 一、在 WSL 中从源码部署（推荐）

WSL 可以访问 Windows 文件系统（`/mnt/c/`），一个 ccgauge 实例即可
同时扫描 WSL 和 Windows 两个环境的 Claude Code 数据。

### 1. 环境要求

- Node.js 20+
- pnpm 10+

```bash
# 检查版本
node -v   # >= 20
pnpm -v   # >= 10
```

如果没有 pnpm：
```bash
npm i -g pnpm
```

### 2. 克隆项目并切换分支

```bash
git clone https://github.com/183731491/ccgauge.git
cd ccgauge
git checkout feat/gelu
```

### 3. 安装依赖并构建

```bash
pnpm install
pnpm build
```

构建成功会输出类似以下内容：

```
[build-mcp] dist/mcp/server.mjs written (v1.1.2)
[build-report] dist/report/index.mjs written
[postbuild] copied static assets into .next/standalone
[smoke] ✓ pruned standalone serves all key routes
```

### 4. 启动

```bash
# 前台运行（Ctrl+C 停止，终端需保持打开）
pnpm start

# 后台运行（推荐，关闭终端不影响）
node bin/cli.mjs start -b

# 同时扫描 Windows 数据（核心：--dir 追加额外目录）
node bin/cli.mjs start -b --dir /mnt/c/Users/<你的Windows用户名>/.claude
```

`--dir /mnt/c/Users/<用户名>/.claude` 会追加
`/mnt/c/Users/<用户名>/.claude/projects` 到扫描列表，**不会替换**
默认的 `~/.claude/projects`（WSL 自身数据）。

最终扫描的目录：

| 数据来源 | 路径 |
|---|---|
| WSL Claude Code | `~/.claude/projects` |
| Windows Claude Code | `/mnt/c/Users/<用户名>/.claude/projects` |

### 5. 常用管理命令

```bash
# 查看运行状态
node bin/cli.mjs status

# 在浏览器中打开面板
node bin/cli.mjs open

# 查看日志
node bin/cli.mjs logs

# 跟踪日志（实时）
node bin/cli.mjs logs -f

# 停止后台服务
node bin/cli.mjs stop

# 修改参数后重启（如更换端口）
node bin/cli.mjs restart -b -p 3738 --dir /mnt/c/Users/<用户名>/.claude
```

### 6. 端口说明

如果端口被占用，ccgauge 会自动选择下一个可用端口。也可以手动指定：

```bash
node bin/cli.mjs start -b -p 10000 --dir /mnt/c/Users/<用户名>/.claude
```

---

## 二、在 Windows 原生部署（备选）

如果不想通过 WSL，可以直接在 Windows 上原生运行 ccgauge。
但这种方式只能看到 Windows 的 Claude Code 数据，看不到 WSL 的。

### 1. 在 WSL 中构建并打包

```bash
cd ccgauge
pnpm build
npm pack
# 生成 ccgauge-1.1.2.tgz（约 6MB）
```

### 2. 拷贝 tgz 到 Windows

```bash
cp ccgauge-1.1.2.tgz /mnt/d/
# 文件出现在 D:\ccgauge-1.1.2.tgz
```

### 3. 在 Windows 上安装

前置要求：Windows 上安装 Node.js 20+。

```powershell
npm i -g D:\ccgauge-1.1.2.tgz
```

### 4. 在 Windows 上运行

```powershell
# 后台运行
ccgauge start -b

# 如果 WSL 里也跑了一个实例，注意端口不能重复
ccgauge start -b -p 3737

# 查看状态
ccgauge status

# 在浏览器中打开
ccgauge open

# 停止
ccgauge stop
```

如果 WSL 和 Windows 各跑一个实例：

| 实例 | 系统 | 端口 | 看到的数据 |
|---|---|---|---|
| WSL 中的 ccgauge | Linux | 10000 | WSL + Windows（通过 --dir） |
| Windows 原生 ccgauge | Windows | 3737 | 仅 Windows |

---

## 三、构建注意事项

`scripts/postbuild.mjs` 在构建后会清理 Next.js standalone 中不需要的
文件以减小包体。**不要删除 `next/dist/compiled/babel`**：Next.js 15.5
的 devtools 在启动时依赖 `babel/code-frame`
（`patch-error-inspect → shared.js`），删除会导致 Windows 上
报 `MODULE_NOT_FOUND` 错误。当前 `feat/gelu` 分支已修复此问题。
