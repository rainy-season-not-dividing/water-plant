# Water Plant Docker 交付说明

这个 `deploy/` 目录就是交付目录。

建议交付方式：

1. 直接把整个 `deploy/` 目录打包给同事
2. 同事把目录内容放到服务器目录 `/www/waterplant.whyfjz.com/`
3. 在服务器执行 `docker compose up -d`

## 目录内容

当前目录建议包含：

- `docker-compose.yml`
- `backend.env`
- `backend.env.example`
- `data/`
- `qdrant/storage/`
- `frontend-nginx/default.conf`
- `nginx/waterplant.whyfjz.com.conf`

其中：

- `docker-compose.yml`：部署编排文件
- `backend.env`：当前可用的后端环境变量文件
- `backend.env.example`：环境变量模板备份
- `data/`：后端持久化数据目录
- `qdrant/storage/`：Qdrant 向量数据库持久化目录
- `frontend-nginx/default.conf`：前端容器内 Nginx 外置配置
- `nginx/waterplant.whyfjz.com.conf`：公司 Nginx 反向代理参考配置

## 服务器落地目录

服务器目录固定为：

```text
/www/waterplant.whyfjz.com/
```

部署后应为：

```text
/www/waterplant.whyfjz.com/
  docker-compose.yml
  backend.env
  data/
  qdrant/
    storage/
  frontend-nginx/
    default.conf
```

## 端口与访问方式

- 前端容器只绑定到宿主机本机端口：`127.0.0.1:18080:80`
- 后端容器不暴露宿主机端口
- Qdrant 只绑定到宿主机本机端口：`127.0.0.1:6333:6333`
- 后端容器访问 Qdrant 使用容器服务名：`http://qdrant:6333`
- 前端容器内的 Nginx 配置通过宿主机挂载 `frontend-nginx/default.conf`
- 公司 Nginx 对外监听 `80/443`
- 公司 Nginx 按域名 `waterplant.whyfjz.com` 反代到 `http://127.0.0.1:18080`

这样可以避免和同服务器上其他项目冲突。

## 镜像命名

- 前端镜像：`docker.whyfjz.com/water-plant/water-plant-frontend`
- 后端镜像：`docker.whyfjz.com/water-plant/water-plant-backend`
- Qdrant 镜像：默认 `qdrant/qdrant:v1.12.4`，如使用内部镜像，可在 compose 环境中设置 `QDRANT_IMAGE`

当前 `docker-compose.yml` 中已经写入默认版本号，后续可通过发布脚本自动更新。

## 首次部署步骤

1. 确认服务器目录存在：

```bash
mkdir -p /www/waterplant.whyfjz.com/data /www/waterplant.whyfjz.com/frontend-nginx
mkdir -p /www/waterplant.whyfjz.com/qdrant/storage
```

2. 把 `deploy/` 目录中的文件放到：

```text
/www/waterplant.whyfjz.com/
```

3. 登录镜像仓库：

```bash
docker login docker.whyfjz.com
```

4. 启动服务：

```bash
cd /www/waterplant.whyfjz.com
docker compose pull
docker compose up -d
docker compose ps
```

Qdrant 启动后可在服务器本机检查：

```bash
curl http://127.0.0.1:6333/collections
```

## 更新部署步骤

镜像版本更新后，在服务器执行：

```bash
cd /www/waterplant.whyfjz.com
docker compose pull
docker compose up -d
```

## 公司 Nginx

`nginx/waterplant.whyfjz.com.conf` 是参考配置，部署时通常还需要同事或运维替换：

- `ssl_certificate`
- `ssl_certificate_key`

如果证书尚未下发，可以先只开内网联调，等域名和证书就绪后再挂正式入口。

## 前端容器 Nginx 配置

前端容器内负责静态资源和 `/api` 转发的 Nginx 配置，现已外置到：

```text
frontend-nginx/default.conf
```

这份文件会在容器启动时挂载到 `/etc/nginx/conf.d/default.conf`。

后续如果只想调整以下内容，不需要重打前端镜像：

- `/api` 转发规则
- gzip 配置
- 缓存策略
- 超时
- 静态资源规则

修改后执行：

```bash
cd /www/waterplant.whyfjz.com
docker compose restart frontend
```

## 说明

- `backend.env` 已按当前项目环境整理，可直接作为部署初始值使用
- 后续如果服务器环境与当前环境不一致，再单独调整 `backend.env`
- `data/` 目录必须保留在宿主机，不能放在容器层
- `qdrant/storage/` 目录必须保留在宿主机，不能放在容器层
