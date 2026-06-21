# Backend

FastAPI 后端服务，提供水厂数据接口和 AI Agent 对话能力。

## 启动

```bash
cd backend
pip install -r requirements.txt   # 首次安装依赖
python run.py                     # 启动开发服务器 (localhost:8000, 热重载)
```

## 环境变量

复制 `.env.example` 为 `.env`，填入所需配置（如 LLM API Key）。

## API 文档

启动后访问 http://localhost:8000/docs 查看 Swagger 文档。

## 持久化说明

当前后台配置与运行日志使用文件持久化：

```text
backend/data/admin_config.json
backend/data/scenario_logs.jsonl
backend/data/audit_logs.jsonl
```

读写逻辑位于：

```text
backend/app/repositories/admin_config_repository.py
backend/app/repositories/runtime_log_repository.py
```

完整说明见：

```text
docs/数据持久化说明.md
```
