import uvicorn
import os

if __name__ == "__main__":
    from app.main import app

    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8000"))
    reload = os.getenv("APP_RELOAD", "false").lower() == "true"
    uvicorn.run(app if not reload else "app.main:app", host=host, port=port, reload=reload)
