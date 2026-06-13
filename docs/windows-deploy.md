# Windows 部署说明

ccgauge 支持在 Windows 原生运行，查看 Windows 上 Claude Code 的用量数据。

## 背景

WSL 和 Windows 原生文件系统不互通。如果在 WSL 中运行 ccgauge，只能看到
WSL 里的 Claude Code 用量，无法看到 Windows 原生的用量。因此需要两个实例：

| 实例 | 系统 | 用途 |
|---|---|---|
| WSL 中的 ccgauge | Linux | 查看 WSL 中 Claude Code 的用量 |
| Windows 原生 ccgauge | Windows | 查看 Windows 中 Claude Code 的用量 |

两者端口不同，互不冲突。

## 构建 tgz（在 WSL/Linux 中）

```bash
pnpm build
npm pack
# 生成 ccgauge-1.1.2.tgz
cp ccgauge-1.1.2.tgz /mnt/d/
```

## Windows 安装

前置要求：Windows 上安装 Node.js 20+。

```powershell
npm i -g D:\ccgauge-1.1.2.tgz
```

## 运行

### 后台模式（推荐）

```powershell
# 启动后台服务
ccgauge start -b

# 指定端口（避免和 WSL 实例冲突）
ccgauge start -b -p 3737

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

### 前台模式

```powershell
ccgauge
# Ctrl+C 停止
```

## 端口配置

| 实例 | 默认端口 | 自定义 |
|---|---|---|
| WSL 中的 ccgauge | 3737 | `-p 10000` |
| Windows 原生 ccgauge | 3737 | `-p 3737` 或其他 |

确保两个实例使用不同端口即可。

## 构建注意事项

`scripts/postbuild.mjs` 在构建后会清理 Next.js standalone 中不需要的文件以减小包体。
**不要删除 `next/dist/compiled/babel`**：Next.js 15.5 的 devtools 在启动时需要
`babel/code-frame`（`patch-error-inspect → shared.js`），删除会导致 Windows 上
报 `MODULE_NOT_FOUND` 错误。详见 commit 5690f43 的修复。
