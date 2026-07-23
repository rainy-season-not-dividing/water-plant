# Docs

本目录保存团队规范、架构说明、流程文档和专项说明。

## 推荐阅读顺序

1. `../AGENTS.md`
2. `DEVELOPMENT_GUIDE.md`
3. `ARCHITECTURE.md`
4. `FRONTEND_GUIDE.md`
5. `BACKEND_GUIDE.md`
6. `MODELING_GUIDE.md`
7. `GIT_WORKFLOW.md`
8. `数据持久化说明.md`
9. `../backend/app/rag/README.md`
10. `../deploy/README.md`

## 文档边界

- 项目协作规范、开发流程、架构说明放在 `docs/`。
- 前后端接口、Agent 事件、3D 事件契约放在 `contracts/`。
- RAG 运行链路和脚本说明放在 `backend/app/rag/README.md`。
- 云服务器部署和 Docker 交付说明放在 `deploy/README.md`。
- 不要把长期规则只留在聊天记录里；稳定结论应沉淀到本目录、`contracts/` 或对应模块 README。

## 当前重点文档

| 文档 | 作用 |
| --- | --- |
| `DEVELOPMENT_GUIDE.md` | 总体协作和开发规范 |
| `ARCHITECTURE.md` | 架构边界草案 |
| `FRONTEND_GUIDE.md` | 前端目录和代码规则 |
| `BACKEND_GUIDE.md` | 后端目录和安全规则 |
| `MODELING_GUIDE.md` | 3D 建模交付规则 |
| `GIT_WORKFLOW.md` | 分支、提交和 PR 规则 |
| `数据持久化说明.md` | 文件数据、Docker 数据和 RAG 数据持久化说明 |
