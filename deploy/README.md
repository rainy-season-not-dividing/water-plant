# Water Plant Docker 交付说明

这个 `deploy/` 目录就是交付目录。

建议交付方式：

1. 本地先发布或确认前后端镜像版本，镜像 tag 写在 `deploy/docker-compose.yml` 中。
2. 把 `deploy/` 目录中可提交的部署文件上传到服务器目录 `/www/waterplant.whyfjz.com/`。
3. 在服务器上基于 `backend.env.example` 准备真实 `backend.env`。
4. 把审核后的 Wiki Markdown 上传到服务器知识库目录。
5. 启动 Docker Compose。
6. 用源码工作区或运维目录执行 RAG 同步脚本，把 Wiki 写入 PostgreSQL / Elasticsearch / Qdrant。

## 目录内容

当前目录建议包含：

- `docker-compose.yml`
- `backend.env.example`
- `data/`
- `qdrant/storage/`
- `elasticsearch/data/`
- `postgres/data/`
- `frontend-nginx/default.conf`
- `nginx/waterplant.whyfjz.com.conf`

其中：

- `docker-compose.yml`：部署编排文件
- `backend.env.example`：环境变量模板；服务器上的真实 `backend.env` 由它复制而来，不提交到仓库
- `data/`：后端持久化数据目录
- `qdrant/storage/`：Qdrant 向量数据库持久化目录
- `elasticsearch/data/`：Elasticsearch 关键词索引持久化目录
- `postgres/data/`：PostgreSQL 数据库持久化目录
- `frontend-nginx/default.conf`：前端容器内 Nginx 外置配置
- `nginx/waterplant.whyfjz.com.conf`：公司 Nginx 反向代理参考配置

服务器上还必须手动准备但不提交到仓库：

- `backend.env`：真实后端环境变量，包含 LLM / embedding key、数据库密码等敏感配置
- `wikidb/wiki/`：审核后的 Wiki Markdown 知识库
- 如选择在服务器本机执行 RAG 同步，还需要一份源码/运维目录，至少包含 `scripts/`、`backend/app/` 和 `backend/requirements.txt`

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
  elasticsearch/
    data/
  postgres/
    data/
  wikidb/
    wiki/
  frontend-nginx/
    default.conf
```

## 端口与访问方式

- 前端容器只绑定到宿主机本机端口：`127.0.0.1:18080:80`
- 后端容器不暴露宿主机端口
- Qdrant 只绑定到宿主机本机端口：`127.0.0.1:6333:6333`
- Elasticsearch 只绑定到宿主机本机端口：`127.0.0.1:9200:9200`
- PostgreSQL 只绑定到宿主机本机端口：`127.0.0.1:5432:5432`
- 后端容器访问 Qdrant 使用容器服务名：`http://qdrant:6333`
- 后端容器访问 Elasticsearch 使用容器服务名：`http://elasticsearch:9200`
- 后端容器访问 PostgreSQL 使用容器服务名：`postgres:5432`
- 前端容器内的 Nginx 配置通过宿主机挂载 `frontend-nginx/default.conf`
- 公司 Nginx 对外监听 `80/443`
- 公司 Nginx 按域名 `waterplant.whyfjz.com` 反代到 `http://127.0.0.1:18080`

这样可以避免和同服务器上其他项目冲突。

## 镜像命名

- 前端镜像：`docker.whyfjz.com/water-plant/water-plant-frontend`
- 后端镜像：`docker.whyfjz.com/water-plant/water-plant-backend`
- Qdrant 镜像：默认 `qdrant/qdrant:v1.12.4`，如使用内部镜像，可在 compose 环境中设置 `QDRANT_IMAGE`
- Elasticsearch 镜像：默认 `docker.elastic.co/elasticsearch/elasticsearch:9.4.4`，如使用内部镜像，可设置 `ELASTICSEARCH_IMAGE`
- PostgreSQL 镜像：默认 `postgres:18.0-bookworm`，如使用内部镜像，可设置 `POSTGRES_IMAGE`

当前 `docker-compose.yml` 中已经写入默认版本号，后续可通过发布脚本自动更新。

## 服务器前置条件

部署前需要确认：

- 服务器已安装 Docker 和 Docker Compose，并能访问 `docker.whyfjz.com`
- 服务器可以访问 LLM 和 embedding 服务地址
- `/www/waterplant.whyfjz.com/` 所在磁盘有足够空间保存容器数据、Qdrant 向量、Elasticsearch 索引和 PostgreSQL 数据
- Elasticsearch 所在宿主机建议设置 `vm.max_map_count=262144`
- `backend.env` 中的真实密钥、账号、密码只放在服务器，不提交到仓库
- 若公司 Nginx 对外提供 HTTPS，需要提前准备证书文件路径

Elasticsearch 当前只绑定 `127.0.0.1:9200`，并关闭内置安全认证，适用于本机 Docker 内部部署。若后续需要跨机器访问或直接暴露端口，应重新启用安全认证和 TLS。

## Docker 镜像打包

Docker 镜像由仓库根目录的发布脚本处理：

```powershell
.\scripts\release-docker.ps1 -Version v0.1.10
```

脚本会：

- 构建前端镜像
- 构建后端镜像
- 推送版本 tag
- 默认同步推送 `latest`
- 更新 `deploy/docker-compose.yml` 中的前后端镜像版本

如只想预览命令，不构建、不推送、不改 compose：

```powershell
.\scripts\release-docker.ps1 -Version v0.1.10 -DryRun
```

当前后端镜像只包含运行时服务代码，不包含 `scripts/` 目录。RAG 同步脚本暂时从源码工作区或运维机器执行；如果后续决定把同步脚本打进后端镜像，需要同步调整 `backend/Dockerfile` 和本文档中的执行方式。

## RAG 同步脚本重要说明

`docker compose up -d` 只会启动前端、后端、PostgreSQL、Elasticsearch 和 Qdrant，不会自动把 Wiki Markdown 建成 RAG 索引。

当前后端镜像不包含：

```text
scripts/sync-rag-indexes.py
scripts/evaluate-rag.py
scripts/search-rag-hybrid.py
```

因此首次部署、Wiki 内容更新、chunk 规则调整、索引字段调整或 embedding 配置变化后，需要在具备源码和 Python 环境的位置手动执行同步脚本。只复制单个 `sync-rag-indexes.py` 不够，因为脚本依赖 `backend/app/rag/` 里的模块和 `backend/requirements.txt` 中的依赖。可选执行位置：

- 云服务器本机的源码/运维目录
- 能访问服务器 `127.0.0.1:5432`、`127.0.0.1:9200`、`127.0.0.1:6333` 的运维环境

如果从另一台机器执行脚本，要注意当前 compose 只把 PostgreSQL、Elasticsearch 和 Qdrant 绑定到服务器本机 `127.0.0.1`，外部机器默认访问不到这些端口。更稳妥的做法是在云服务器本机准备源码/运维目录执行同步。

同步脚本执行前必须确认：

- `/www/waterplant.whyfjz.com/wikidb/wiki` 已放入审核后的 Wiki Markdown
- 如果在服务器宿主机执行脚本，`RAG_WIKIDB_ROOT` 应指向宿主机路径 `/www/waterplant.whyfjz.com/wikidb`
- 如果在后端容器内执行脚本，`RAG_WIKIDB_ROOT` 才使用容器内路径 `/app/wikidb`
- 脚本环境中的 `RAG_DATABASE_URL`、`ELASTICSEARCH_URL`、`QDRANT_URL` 能访问目标服务
- embedding 相关环境变量已配置，且维度与 `RAG_VECTOR_DIMENSION` 一致

执行完成后，只有一致性检查返回 `consistent = true`，才能认为服务器 RAG 检索索引就绪。

## 首次部署步骤

1. 本地确认镜像版本。

`deploy/docker-compose.yml` 中的前后端镜像 tag 必须是已经构建并推送到 `docker.whyfjz.com` 的版本。镜像版本由发布人员维护；如果还没有发布当前代码，服务器会继续拉取 compose 中写死的旧版本。

2. 准备服务器目录。

```bash
mkdir -p /www/waterplant.whyfjz.com/data /www/waterplant.whyfjz.com/frontend-nginx
mkdir -p /www/waterplant.whyfjz.com/qdrant/storage
mkdir -p /www/waterplant.whyfjz.com/elasticsearch/data
mkdir -p /www/waterplant.whyfjz.com/postgres/data
mkdir -p /www/waterplant.whyfjz.com/wikidb/wiki
```

3. 上传部署文件。

把本地 `deploy/` 目录中的以下内容上传到 `/www/waterplant.whyfjz.com/`：

```text
docker-compose.yml
backend.env.example
frontend-nginx/default.conf
nginx/waterplant.whyfjz.com.conf
data/
qdrant/storage/.gitkeep
elasticsearch/data/.gitkeep
postgres/data/.gitkeep
```

不要从仓库上传真实密钥文件。服务器上的真实 `backend.env` 应在服务器上由 `backend.env.example` 复制并填写：

```bash
cd /www/waterplant.whyfjz.com
cp backend.env.example backend.env
vi backend.env
```

4. 上传知识库文件。

把审核后的 Wiki Markdown 上传到：

```text
/www/waterplant.whyfjz.com/wikidb/wiki/
```

目录结构需要让脚本能从 `wikidb/wiki/*.md` 读取知识源。

5. 登录镜像仓库。

```bash
docker login docker.whyfjz.com
```

6. 启动服务。

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

Elasticsearch 启动后可在服务器本机检查：

```bash
curl http://127.0.0.1:9200/_cluster/health
```

PostgreSQL 启动后可在服务器本机检查：

```bash
docker compose exec postgres pg_isready -U water_plant -d water_plant
```

7. 准备 RAG 同步脚本运行环境。

当前推荐在服务器本机准备一份源码/运维目录，例如：

```text
/www/waterplant.whyfjz.com/ops/water_plant_source/
  backend/
    app/
    requirements.txt
  scripts/
```

安装依赖：

```bash
cd /www/waterplant.whyfjz.com/ops/water_plant_source/backend
python -m pip install -r requirements.txt
```

8. 在源码/运维目录执行 RAG 同步。

如果脚本在服务器宿主机执行，环境变量要使用宿主机可访问地址：

```bash
cd /www/waterplant.whyfjz.com/ops/water_plant_source
set -a
. /www/waterplant.whyfjz.com/backend.env
set +a
export RAG_WIKIDB_ROOT=/www/waterplant.whyfjz.com/wikidb
export QDRANT_URL=http://127.0.0.1:6333
export ELASTICSEARCH_URL=http://127.0.0.1:9200
export RAG_DATABASE_URL=postgresql://water_plant:<POSTGRES_PASSWORD>@127.0.0.1:5432/water_plant
python scripts/sync-rag-indexes.py --json
python scripts/sync-rag-indexes.py --check --json
```

如果脚本改为在后端容器内执行，才使用 `backend.env` 中的容器服务名配置：

```powershell
python scripts/sync-rag-indexes.py --json
python scripts/sync-rag-indexes.py --check --json
```

同步检查通过时，应重点确认：

- planned documents 与 planned chunks 数量符合预期
- PostgreSQL active chunks 数量与 planned chunks 一致
- Elasticsearch active chunks 数量与 planned chunks 一致
- Qdrant active chunks 数量与 planned chunks 一致
- `consistent = true`

## 更新部署步骤

镜像版本更新后，在服务器执行：

```bash
cd /www/waterplant.whyfjz.com
docker compose pull
docker compose up -d
```

如果本次更新包含 Wiki 内容或 RAG 索引结构调整，还需要在服务启动后重新执行：

```bash
python scripts/sync-rag-indexes.py --json
python scripts/sync-rag-indexes.py --check --json
```

执行位置和环境变量要求与首次部署第 7、8 步一致；宿主机执行时使用 `127.0.0.1` 访问 PostgreSQL、Elasticsearch 和 Qdrant，容器内执行时才使用 compose 服务名。

如果只是前后端镜像代码更新，且 Wiki、chunk 规则、索引字段和 embedding 配置都没有变化，可以不重建 RAG 索引。

## 备份与回滚

建议在升级前备份：

- `/www/waterplant.whyfjz.com/backend.env`
- `/www/waterplant.whyfjz.com/wikidb/`
- `/www/waterplant.whyfjz.com/postgres/data/`
- `/www/waterplant.whyfjz.com/qdrant/storage/`
- `/www/waterplant.whyfjz.com/elasticsearch/data/`

镜像回滚时，将 `deploy/docker-compose.yml` 中前后端镜像 tag 改回上一个版本，然后执行：

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

- `backend.env.example` 是部署模板；真实 `backend.env` 必须在服务器上复制并填写，不提交到仓库
- 后续如果服务器环境与模板不一致，再单独调整服务器上的 `backend.env`
- `data/` 目录必须保留在宿主机，不能放在容器层
- `qdrant/storage/` 目录必须保留在宿主机，不能放在容器层
- `elasticsearch/data/` 目录必须保留在宿主机，不能放在容器层
- `postgres/data/` 目录必须保留在宿主机，不能放在容器层
- `wikidb/` 是知识源目录，后端容器只读使用；同步脚本只读取它，不修改原始 Markdown
- PostgreSQL 18 官方镜像的数据目录建议挂载到 `/var/lib/postgresql`，当前 compose 已按该目录挂载
- 当前 Elasticsearch 只绑定本机端口且关闭内置安全认证，适合当前单机 Docker 内部部署；如后续跨机器访问或直接暴露 ES，应重新启用安全认证和 TLS
- RAG 默认使用 `water_plant_rag_chunks` 作为 Qdrant collection 和 Elasticsearch index
- RAG 查询默认走 hybrid，PostgreSQL 只保存索引状态，不承担向量或 BM25 检索
