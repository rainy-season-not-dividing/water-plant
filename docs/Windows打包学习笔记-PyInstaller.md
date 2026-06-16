# Windows 打包学习笔记：前端 dist + FastAPI 后端 exe

这份笔记用本项目 `water_plant` 作为例子，解释“把后端打成 exe，再让后端托管前端 dist”的打包方式。它适合 Windows 内部分发：把一个文件夹发给别人，对方双击脚本就能在浏览器里打开系统。

## 1. 这类打包解决什么问题

普通前后端项目通常需要两套运行环境：

- 前端：Node.js、npm、Vite、React
- 后端：Python、FastAPI、依赖包、`.env`

如果直接把源码发给别人，对方需要安装 Node、Python、依赖，还要知道先后启动顺序。这个门槛比较高。

本项目采用的方式是：

```text
React 前端 -> npm run build -> frontend/dist 静态文件
FastAPI 后端 -> PyInstaller -> water-plant.exe
water-plant.exe 同时提供 API 和前端页面
```

最终别人拿到的是：

```text
water-plant-windows/
├── water-plant.exe
├── _internal/
├── .env
├── .env.example
├── start-water-plant.bat
└── README.txt
```

对方只需要双击：

```text
start-water-plant.bat
```

浏览器访问：

```text
http://127.0.0.1:8000
```

## 2. 核心思路

### 2.1 前端为什么可以变成静态文件

React + Vite 开发时需要 dev server：

```powershell
cd frontend
npm run dev
```

但生产环境执行：

```powershell
npm run build
```

会生成：

```text
frontend/dist/
├── index.html
└── assets/
```

这些文件本质上就是 HTML、CSS、JS、图片、模型等静态资源。只要有一个 HTTP 服务能把它们返回给浏览器，前端就能运行。

### 2.2 后端为什么可以托管前端

FastAPI 不只能提供 API，也能返回静态文件。本项目在 `backend/app/main.py` 里增加了一个兜底路由：

```python
@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    ...
```

含义是：

- `/api/...` 仍然走后端 API
- `/health` 仍然走健康检查
- 其他路径优先找前端静态文件
- 找不到时返回 `index.html`，让 React 前端路由接管

这样浏览器打开：

```text
http://127.0.0.1:8000/
```

实际就是后端 exe 返回了前端页面。

### 2.3 PyInstaller 做了什么

PyInstaller 会分析 Python 入口文件和依赖，把 Python 解释器、依赖库、项目代码打包成 Windows 可执行程序。

本项目入口是：

```text
backend/run.py
```

打包配置是：

```text
backend/water_plant.spec
```

最终生成：

```text
backend/dist/water-plant/water-plant.exe
```

## 3. 本项目具体文件说明

### 3.1 后端入口：`backend/run.py`

当前后端入口支持环境变量：

```python
host = os.getenv("APP_HOST", "127.0.0.1")
port = int(os.getenv("APP_PORT", "8000"))
reload = os.getenv("APP_RELOAD", "false").lower() == "true"
```

默认行为：

```text
APP_HOST=127.0.0.1
APP_PORT=8000
APP_RELOAD=false
```

这适合 Windows 发布包，因为发布包通常只给本机浏览器访问。

开发时如果需要局域网访问或热重载：

```powershell
$env:APP_HOST="0.0.0.0"
$env:APP_RELOAD="true"
python backend/run.py
```

### 3.2 环境变量加载：`backend/app/main.py`

本项目需要 `.env` 提供 LLM 配置：

```env
LLM_API_KEY=...
LLM_BASE_URL=...
LLM_MODEL=...
```

打包后 exe 的运行目录和源码目录不同，所以不能只依赖默认的 `load_dotenv()` 自动查找。本项目用了：

```python
def _runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]
```

含义是：

- 开发环境：读取 `backend/.env`
- exe 环境：读取 `water-plant.exe` 所在目录的 `.env`

这是发布包能修改 `.env` 后生效的关键。

### 3.3 前端 dist 查找：`backend/app/main.py`

本项目会在多个位置寻找前端构建产物：

```python
candidates = [
    _resource_dir() / "frontend_dist",
    _runtime_dir() / "frontend_dist",
    Path(__file__).resolve().parents[2] / "frontend" / "dist",
]
```

含义是：

- PyInstaller 打包资源里找 `frontend_dist`
- exe 运行目录找 `frontend_dist`
- 开发环境找 `frontend/dist`

所以开发环境和 exe 环境都可以共用同一套 FastAPI 静态托管逻辑。

### 3.4 PyInstaller 配置：`backend/water_plant.spec`

关键配置：

```python
project_root = Path(SPECPATH).parent
frontend_dist = project_root / "frontend" / "dist"

datas = [
    (str(frontend_dist), "frontend_dist"),
]
```

这里把 `frontend/dist` 打进 PyInstaller 产物里，并在运行时映射成：

```text
frontend_dist/
```

另一个关键配置：

```python
pathex=[str(Path(SPECPATH)), str(project_root)]
```

这让 PyInstaller 能找到后端的 `app` 包，否则 exe 启动时可能报：

```text
ModuleNotFoundError: No module named 'app'
```

## 4. 一键构建脚本

主脚本：

```text
scripts/build-windows-release.ps1
```

入口脚本：

```text
scripts/build-windows-release.bat
```

使用方式：

```powershell
scripts\build-windows-release.bat
```

脚本分 5 步：

```text
[1/5] Build frontend
[2/5] Prepare Python dependencies
[3/5] Build backend exe
[4/5] Copy release files
[5/5] Done
```

### 4.1 为什么使用 `.venv-release`

脚本会创建：

```text
.venv-release/
```

这是专门给 PyInstaller 使用的虚拟环境。

原因是全局 Python 环境里可能有很多不相关的包，版本容易互相影响。之前就遇到过 `setuptools` 和 PyInstaller 依赖不兼容的问题。单独建 `.venv-release` 后，打包更稳定，也不会污染开发环境。

### 4.2 为什么 bat 调 PowerShell

Windows `.bat` 对中文路径和编码比较脆弱。本项目路径里有中文：

```text
E:\迎风聚智\组内项目\water_plant
```

所以 `.bat` 只做入口：

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows-release.ps1"
```

真正逻辑放在 PowerShell 脚本里，路径处理更稳。

## 5. 发布包启动脚本

发布包里会包含：

```text
start-water-plant.bat
```

它做三件事：

1. 启动 `water-plant.exe`
2. 等待 `/health` 返回正常
3. 自动打开浏览器

默认访问：

```text
http://127.0.0.1:8000
```

如果 8000 端口被占用，可以先设置：

```powershell
$env:APP_PORT="8765"
```

再启动 exe。

## 6. 和 Docker 部署的区别

### Windows 发布包

适合：

- 给不会配置环境的人试用
- 内网演示
- 单机运行
- Windows 电脑双击启动

特点：

- 不需要安装 Python
- 不需要安装 Node.js
- 配置集中在发布包 `.env`
- 更新时重新发一个包

### Docker / 云服务器

适合：

- 多人通过公网访问
- 长期运行
- 服务器部署
- 用 Nginx、容器编排、日志监控

特点：

- 需要服务器和 Docker 环境
- 服务可以监听公网
- 更适合正式部署

## 7. 常见问题

### 7.1 LLM 报 403 FreeTierOnly

这通常不是代码问题，而是模型服务返回：

```text
AllocationQuota.FreeTierOnly
```

含义是当前 API Key 在该模型上的免费额度或免费模式受限。排查：

```powershell
python - <<'PY'
import os
from dotenv import load_dotenv
load_dotenv("backend/.env")
key = os.getenv("LLM_API_KEY", "")
print("BASE_URL=", os.getenv("LLM_BASE_URL"))
print("MODEL=", os.getenv("LLM_MODEL"))
print("KEY_LEN=", len(key), "KEY_PREFIX=", key[:8])
PY
```

对比本地、云服务器、另一个可用服务器的三项：

```text
LLM_BASE_URL
LLM_MODEL
LLM_API_KEY 前缀和长度
```

### 7.2 exe 启动后找不到 app

典型错误：

```text
ModuleNotFoundError: No module named 'app'
```

检查 `backend/water_plant.spec` 是否包含：

```python
pathex=[str(Path(SPECPATH)), str(project_root)]
```

### 7.3 页面能打开，但 API 不通

先检查健康接口：

```text
http://127.0.0.1:8000/health
```

再检查前端 `.env` 构建配置是否使用相对路径：

```env
VITE_API_BASE_URL=/api
VITE_AI_BASE_URL=/api
```

本项目构建脚本中已设置：

```powershell
$env:VITE_API_MODE = "live"
$env:VITE_API_BASE_URL = "/api"
$env:VITE_AI_BASE_URL = "/api"
```

### 7.4 重新打包时报文件被占用

如果发布包正在运行，复制覆盖时可能失败，例如：

```text
Access to the path '*.pyd' is denied
```

先关闭 `water-plant.exe`，再重新运行构建脚本。

### 7.5 中文路径导致脚本乱码

尽量避免在 `.bat` 里写复杂中文路径。把复杂逻辑放到 `.ps1`，并用路径自动查找：

```powershell
Get-ChildItem -Path $DailyList -Directory -Filter "20260612-*"
```

## 8. 哪些文件需要提交

建议提交：

```text
backend/water_plant.spec
scripts/build-windows-release.bat
scripts/build-windows-release.ps1
scripts/start-water-plant.bat
scripts/README-windows-release.txt
docs/Windows打包学习笔记-PyInstaller.md
docs/部署与打包说明.md
```

不要提交：

```text
.venv-release/
backend/build/
backend/dist/
frontend/dist/
water-plant-windows/
*.zip
*.7z
*.rar
.env
```

## 9. 一句话总结

本项目的 Windows 打包方式，本质是：

```text
把 React 前端编译成静态文件，
再把 FastAPI 后端和这些静态文件一起打包成 exe，
让一个 exe 同时提供页面和 API。
```

它不是 Docker 的替代品，而是适合 Windows 单机演示和内部分发的轻量发布方式。
