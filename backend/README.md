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
