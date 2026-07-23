# 智能水厂项目

本仓库是智能水厂演示系统，包含前端应用、FastAPI 后端、Agent 分析链路、RAG 知识检索底座和 Docker 部署配置。

当前重点能力：

- 前端：React + TypeScript + Vite，展示水厂驾驶舱、异常分析、Agent 流程和 3D 演示。
- 后端：FastAPI，提供数据接口、AI 分析、Agent 运行边界和 RAG 检索服务。
- RAG：Wiki Markdown 通过同步脚本写入 PostgreSQL 状态库、Elasticsearch BM25 索引和 Qdrant 向量库；运行时默认走 ES + Qdrant + RRF hybrid 检索。
- 部署：`deploy/` 提供云服务器 Docker Compose 交付目录。

系统只作为 AI 副驾驶和演示系统，不自动下发 PLC、泵阀、反洗、CEB、CIP、加药等真实硬件控制动作。

## 阅读顺序

1. `AGENTS.md`
2. `docs/DEVELOPMENT_GUIDE.md`
3. `docs/ARCHITECTURE.md`
4. `frontend/README.md`
5. `backend/README.md`
6. `backend/app/rag/README.md`
7. `deploy/README.md`

更多规范入口见 `docs/README.md`。

## 本地开发

前端：

```powershell
cd frontend
npm install
npm run dev
```

后端：

```powershell
cd backend
pip install -r requirements.txt
python run.py
```

后端 API 文档：

```text
http://localhost:8000/docs
```

## RAG 本地索引服务

本地使用根目录 `docker-compose.yml` 启动 PostgreSQL、Elasticsearch 和 Qdrant：

```powershell
docker compose up -d postgres elasticsearch qdrant
```

检查服务：

```powershell
curl http://127.0.0.1:6333/collections
curl http://127.0.0.1:9200/_cluster/health
docker compose exec postgres pg_isready -U water_plant -d water_plant
```

同步 Wiki 索引并检查一致性：

```powershell
python scripts/sync-rag-indexes.py --json
python scripts/sync-rag-indexes.py --check --json
```

调试 hybrid 检索：

```powershell
python scripts/search-rag-hybrid.py "浊度升高可能是什么原因？" --mode hybrid --top-k 5 --json
```

RAG 详细说明见 `backend/app/rag/README.md`。

## Docker 交付

Docker 交付目录：

```text
deploy/
```

发版脚本：

```powershell
.\scripts\release-docker.ps1 -Version v0.1.10
```

脚本会构建并推送前后端镜像，然后更新 `deploy/docker-compose.yml` 中的镜像 tag。服务器部署、目录准备、RAG 同步脚本运行位置和注意事项见 `deploy/README.md`。

注意：当前后端镜像只包含运行时服务代码，不包含 `scripts/`。RAG 同步脚本暂时从源码工作区或运维机器执行，后续确实需要容器内同步时再补独立同步容器或运维镜像。

## 验证命令

后端测试：

```powershell
cd backend
python -m unittest discover -s tests -p "test_*.py"
```

前端检查：

```powershell
cd frontend
npm run lint
npm run build
```

Compose 检查：

```powershell
docker compose config --quiet
docker compose -f deploy/docker-compose.yml config --quiet
```

## 目录概览

```text
frontend/    React 前端
backend/     FastAPI 后端和 Agent / RAG 运行能力
contracts/   前后端和 Agent 事件契约
assets/      模型和共享素材
docs/        团队规范、架构和流程文档
deploy/      云服务器 Docker 交付目录
scripts/     发布、RAG 同步、评测和调试脚本
```
