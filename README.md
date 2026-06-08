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
python .\run.py
```
