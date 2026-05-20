# CronWin - Windows 任务计划管理器

CronWin (Contab for Windows) 是一个在Windows上基于 Web 的任务调度管理工具，支持定时执行各种脚本（Python, Shell, Node 等），像 Linux 下的 `crontab` 添加配置，同时提供执行日志以及状态监控。

## 适用环境
- 操作系统：Windows (如 Windows 11)
- 必须安装：[Node.js](https://nodejs.org/) (推荐 v18 或更高版本)
- 可选环境：
  - 如果要运行 Python 任务：需在系统安装 Python 并将其加入环境变量 (PATH)。
  - 如果要运行 Shell 脚本：在此推荐安装 [Git for Windows (Git Bash)](https://gitforwindows.org/)，并确保 `sh.exe` 或 `bash.exe` 可在命令行直接调用。

## 1. 安装与构建部署

### 环境依赖安装
在项目根目录（带有 `package.json` 的目录），打开终端（命令行或 PowerShell），执行以下命令安装依赖：
```bash
npm install
```

### 开发环境运行 (便于修改代码)
```bash
npm run dev
```
启动后，控制台会输出启动端口（通常为 `http://localhost:3000`）。此时前端与后端在同一进程运行。修改相关前端代码保存后会自动热更新。

### 编译与生产环境运行
在将服务部署到服务器或后台静默运行时，建议先编译打包。

**编译（Build）：**
```bash
npm run build
```
执行完毕后，所有前端文件将被打包到 `dist` 目录，后端代码被打包成 `dist/server.cjs`。

**启动正式服务（Start）：**
```bash
npm start
```
或者也可以直接运行 `node dist/server.cjs`。
_注意：此时也可以使用 `pm2` 等进程守护工具后台运行此服务，例如 `pm2 start dist/server.cjs --name cronwin`。_

## 2. 日志查看说明

**运行日志主要有两个查看途径：**
1. **控制台/终端窗口**：不论是 `npm run dev` 还是 `npm start`，服务端的核心执行、调度信息、标准错误 (stderr) 都会直接打印在运行本服务的黑框（控制台终端）中。
2. **Web 界面日志监控栏**：在页面右下方的「实时执行控制台 (Logs)」中展示了最近 500 条的任务执行流水，包括运行时间、执行的命令、成功或失败状态。

---

## 3. 任务配置与路径书写示例

在新建任务时，Windows 路径推荐**使用正斜杠 `/`** 书写以避免转义错误，或者使用双反斜杠 `\\`。

### 示例 1: Python 脚本执行
假设您的脚本路径为 `D:\scripts\data_sync.py`：
- **任务名称**: `Python_Data_Sync`
- **Cron表达式**: `0 */2 * * *` （每两小时整点执行）
- **执行脚本 / 命令**:
  ```bash
  python D:/scripts/data_sync.py
  ```
  _或者带上参数_：
  ```bash
  python D:/scripts/data_sync.py --env prod
  ```

### 示例 2: Shell / Git Bash 脚本执行
假设您的脚本为 `C:\Users\Admin\Documents\backup.sh`：
- **任务名称**: `Daily_Backup_Shell`
- **Cron表达式**: `0 2 * * *` （每天凌晨 2 点执行）
- **执行脚本 / 命令**:
  ```bash
  sh C:/Users/Admin/Documents/backup.sh
  ```
  _注意：需确保系统中全局可以调用 `sh` 命令（将 Git 的 bin 目录加入了环境变量）。如果没有加环境变量，可以写绝对路径，例如_：
  ```bash
  "C:/Program Files/Git/bin/sh.exe" C:/Users/Admin/Documents/backup.sh
  ```

### 示例 3: Node.js 脚本或系统指令
- **执行 Node 脚本**: `node ./scripts/clean.js` （相对路径是相对于 CronWin 所在目录运行）
- **系统命令**: `echo "Hello World" >> C:/logs/test.log`

---

## 常见问题
- **“Error saving task” 报错**：请检查命令行后台是否有异常崩溃，或者 Cron 表达式是否输入非法。合法的表达式有 5 个部分（偶尔支持 6 个部分含秒），例如 `*/5 * * * *`。
- **任务状态 `FAILED`**：请到底部控制台看报错或者去后台终端查看详细的报错流。可能是脚本中语法错误或者路径未找到。

---

## 项目核心功能与架构的设计小结
**核心调度引擎**：集成了稳定的 Cron 表达式解析与定时调度机制，支持任务的自动化高效触发，并在任务面板直观计算并展示精准的“下一次运行时间”。

**精细化执行策略**：
- 防挂死与容错：为任务级别引入了自定义的 超时时间控制 与 失败自动重试机制，确保单一异常任务不会阻塞整体调度。
- 编码自动适配：从底层处理了 Windows 控制台及 Python 脚本输出的中文乱码问题，支持 UTF-8 与 GBK 环境的安全流式读取。

**全链路运行观测**：
- 构建了独立的任务历史与运行状态持久化系统，主界面实时反馈各个任务的“上次运行状态”。
- 提供了专属的“日志查询面板”，可深层追溯每一个任务的启动时间、耗时记录，以及完整的终端标准输出与错误报错 (stdout/stderr)。

**现代化交互与体验**：采用深色极简风格 (Dark Theme) 布局，提供一键启用/停用、无缝编辑、手动立即执行等便捷交互，配合主页面的实时全局流日志，让任务的运行状态一目了然。
