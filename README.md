# 水厂项目

本项目当前以 **前端 Demo** 为主，技术栈切换为 **React + TypeScript + Vite**。

这一阶段先不推进后端实现，重点放在：

1. 前端结构拆分
2. 3D 场景和交互解耦
3. 真实接口的前置预留
4. 方便后续多人协作接手

## 当前范围

- 前端：React 版纯前端 Demo
- 后端：暂缓，不纳入当前阶段
- 接口：先做 mock 和字段契约预留
- 3D：保留演示逻辑，后续再拆成独立场景模块

## 阅读顺序

1. `AGENTS.md`
2. `docs/DEVELOPMENT_GUIDE.md`
3. `docs/FRONTEND_GUIDE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/React项目-文件结构.md`
6. `docs/界面设计方案-综合说明.md`

## 前端运行

```sh
cd frontend
npm install
npm run dev
```

验证时建议再跑：

```sh
cd frontend
npm run lint
npm run build
```

## 后端运行

```sh
cd backend
python .
```

## Docker 交付与部署

当前项目已经补齐了面向同事交付的 Docker 部署目录，位于：

```text
deploy/
```

核心交付文件包括：

- `deploy/docker-compose.yml`
- `deploy/backend.env`
- `deploy/backend.env.example`
- `deploy/frontend-nginx/default.conf`
- `deploy/nginx/waterplant.whyfjz.com.conf`
- `deploy/README.md`

### 交付目录怎么用

交付时，直接把整个 `deploy/` 目录打包给部署同事即可。

同事在服务器上需要将这些文件放到：

```text
/www/waterplant.whyfjz.com/
```

最终服务器目录结构建议为：

```text
/www/waterplant.whyfjz.com/
  docker-compose.yml
  backend.env
  data/
  frontend-nginx/
    default.conf
```

其中：

- `docker-compose.yml` 来自 `deploy/docker-compose.yml`
- `backend.env` 来自 `deploy/backend.env`
- `data/` 是后端持久化数据目录
- `frontend-nginx/default.conf` 是前端容器内 Nginx 的宿主机挂载配置

### 当前部署策略

- 前端镜像：`docker.whyfjz.com/water-plant/water-plant-frontend`
- 后端镜像：`docker.whyfjz.com/water-plant/water-plant-backend`
- 前端只绑定本机端口：`127.0.0.1:18080:80`
- 后端不暴露宿主机端口
- 前端容器内的 Nginx 配置通过宿主机挂载 `frontend-nginx/default.conf`
- 公司 Nginx 再按域名 `waterplant.whyfjz.com` 反代到 `127.0.0.1:18080`

这样可以避免和同服务器上的其他项目端口冲突。

### 首次部署流程

1. 登录公司镜像仓库

```bash
docker login docker.whyfjz.com
```

2. 在服务器创建部署目录

```bash
mkdir -p /www/waterplant.whyfjz.com/data /www/waterplant.whyfjz.com/frontend-nginx
```

3. 把 `deploy/` 目录中的文件放到 `/www/waterplant.whyfjz.com/`

4. 启动服务

```bash
cd /www/waterplant.whyfjz.com
docker compose pull
docker compose up -d
docker compose ps
```

### 更新部署流程

当镜像版本更新后，服务器执行：

```bash
cd /www/waterplant.whyfjz.com
docker compose pull
docker compose up -d
```

### 公司 Nginx 说明

参考配置文件位于：

```text
deploy/nginx/waterplant.whyfjz.com.conf
```

部署时通常还需要运维或部署同事补充：

- `ssl_certificate`
- `ssl_certificate_key`

也就是说：

- Docker 容器里不处理 HTTPS 证书
- 域名和证书放在公司 Nginx 层
- 公司 Nginx 把请求转发到 `127.0.0.1:18080`

前端容器内部用于静态资源和 `/api` 转发的 Nginx 配置，现已外置到：

```text
deploy/frontend-nginx/default.conf
```

因此后续如果只改代理、gzip、缓存、超时等规则，不需要重打前端镜像，只需修改宿主机配置并重启前端容器。

## Docker 发布脚本

当前已经补充自动发布脚本：

- `scripts/release-docker.ps1`
- `scripts/release-docker.bat`

脚本会自动完成以下动作：

1. 读取 `deploy/docker-compose.yml` 中当前镜像版本
2. 计算新版本号，默认按 `patch` 自增
3. 构建前端镜像和后端镜像
4. 推送固定版本 tag
5. 按需推送 `latest`
6. 推送成功后，把 `deploy/docker-compose.yml` 中的镜像版本回写为新版本

### 默认发布行为

直接执行：

```powershell
.\scripts\release-docker.ps1
```

默认行为是：

- 当前版本若为 `v0.1.0`
- 则自动发版到 `v0.1.1`
- 同时推送：
  - 固定版本 tag，例如 `v0.1.1`
  - `latest`

也就是说，`latest` 默认是会一起推送的。

### 为什么说 latest 是“可选”

之所以说“可选”，是因为脚本支持控制是否推送 `latest`。

默认会推 `latest`，因为脚本参数中：

```powershell
[switch]$PushLatest = $true
```

如果后续你想改成“不推 latest”，可以把脚本逻辑再改成显式开关，或者我们后续再补一个 `-NoLatest` 版本。

当前这版脚本的默认行为可以理解为：

- 固定版本 tag：必须推
- `latest`：默认也推

### 指定版本号发布

```powershell
.\scripts\release-docker.ps1 -Version v0.1.5
```

### 按次版本升级

```powershell
.\scripts\release-docker.ps1 -Bump minor
```

### 按主版本升级

```powershell
.\scripts\release-docker.ps1 -Bump major
```

### 只演练，不真正执行

```powershell
.\scripts\release-docker.ps1 -DryRun
```

### 使用 bat 入口

如果你更习惯双击或 `bat` 启动，也可以执行：

```bat
scripts\release-docker.bat
```

它本质上只是转调 PowerShell 脚本。

## 当前注意事项

- `deploy/backend.env` 当前已写入真实可用配置，属于敏感交付文件
- 不建议将真实 `backend.env` 再提交到公共仓库或扩散给无关人员
- 前端生产构建已经补了 `frontend/.env.production`，会走 `live` 模式而不是 `mock`
