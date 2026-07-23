# Frontend

前端是智能水厂演示应用，使用 React + TypeScript + Vite。

## 启动

```powershell
cd frontend
npm install
npm run dev
```

检查：

```powershell
npm run lint
npm run build
```

## 技术栈

- React
- TypeScript
- Vite
- Tailwind CSS
- lucide-react
- motion

## 目录边界

```text
src/app/           应用初始化和全局配置
src/pages/         路由页面组合
src/features/      业务功能模块
src/components/    跨业务复用组件
src/simulation3d/  3D 场景、动画和设备表现
src/api/           接口客户端、mock 和数据适配
src/stores/        前端状态
src/types/         共享类型
src/utils/         工具函数
src/styles/        全局样式
```

## 数据模式

前端可以使用 mock，也可以通过 `/api` 访问后端。真实接口字段应从 `api/` 和类型定义进入页面，不应在组件里硬编码后端 URL 或外部系统字段。

生产 Docker 镜像由 `scripts/release-docker.ps1` 构建，部署时前端容器内 Nginx 配置通过 `deploy/frontend-nginx/default.conf` 挂载。

## 开发约束

- 页面只做路由级组合，复杂业务逻辑放到 `features/`。
- 通用 UI 放到 `components/`。
- 3D 运行逻辑放到 `simulation3d/`。
- 与后端、Agent、3D 事件相关的稳定契约优先同步到 `contracts/` 或相关文档。
