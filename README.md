---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 8afbe7c658d8ab911e7b05711c69bc8e_850aec50916411f1bafa525400287e28
    ReservedCode1: 21e1yemnGnWosgEVaPbCoSu3pM2R+Fgxozw5cVIuSjQmL3PVF6wHmMVZ+zkLqMu4BSYFa2u8a1HE//kP7HyGOf1I+NlmaU2/I0exsCEEut7qpiitO/4QiY67EOSm42iFXiHkpg3vSiT9IO+IOr6YYdU3D3FbxANI3gCzo4LACEEbYvre3ItgVrt83Y0=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 8afbe7c658d8ab911e7b05711c69bc8e_850aec50916411f1bafa525400287e28
    ReservedCode2: 21e1yemnGnWosgEVaPbCoSu3pM2R+Fgxozw5cVIuSjQmL3PVF6wHmMVZ+zkLqMu4BSYFa2u8a1HE//kP7HyGOf1I+NlmaU2/I0exsCEEut7qpiitO/4QiY67EOSm42iFXiHkpg3vSiT9IO+IOr6YYdU3D3FbxANI3gCzo4LACEEbYvre3ItgVrt83Y0=
---



 AI Chat Platform

企业级 AI 对话平台，基于 React + FastAPI + PostgreSQL。

## 项目结构

```
ai-chat-platform/
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── main.py       # 应用入口
│   │   ├── config.py     # 配置管理
│   │   ├── database.py   # 数据库连接
│   │   ├── models.py     # SQLAlchemy 模型
│   │   ├── schemas.py    # Pydantic 请求/响应模型
│   │   ├── auth.py       # 认证与授权
│   │   └── routes/       # API 路由
│   │       ├── auth.py   # 注册/登录
│   │       ├── chat.py   # 对话核心
│   │       └── admin.py  # 管理后台
│   ├── requirements.txt
│   └── .env.example
├── frontend/         # React 前端
│   ├── src/
│   │   ├── api.ts         # API 调用封装
│   │   ├── store.ts       # Zustand 状态管理
│   │   ├── App.tsx        # 路由配置
│   │   ├── pages/
│   │   │   ├── Login.tsx  # 登录/注册
│   │   │   ├── Chat.tsx   # 对话界面
│   │   │   └── Admin.tsx  # 管理后台
│   │   └── components/
│   │       ├── Layout.tsx
│   │       ├── Sidebar.tsx
│   │       └── MessageBubble.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── README.md
```

 快速启动

 前置条件
- Python 3.11+
- Node.js 18+
- PostgreSQL 16+
- Redis (可选，缓存)

 1. 创建数据库

```sql
CREATE DATABASE ai_chat;
```

 2. 启动后端

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入 OPENAI_API_KEY 等
pip install -r requirements.txt
python -m app.main
```

后端运行在 http://localhost:8000

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端运行在 http://localhost:5173

### 4. 初始化超级管理员

首次启动后，调用注册接口创建一个用户，然后手动在数据库中将其 role 改为 `super_admin`：

```sql
UPDATE users SET role = 'super_admin' WHERE username = 'admin';
```

## 功能列表

- [x] 流式对话 (SSE)
- [x] 多模型切换
- [x] Markdown 渲染 + 代码高亮
- [x] 多会话管理 (新建/切换/删除/重命名)
- [x] 用户注册/登录
- [x] 管理员查看用户列表
- [x] 管理员启停用户
- [x] 使用记录审计
- [x] 对话内容查看
- [x] 每日统计概览
- [x] 用户配额管理
- [ ] 知识库模块
- [ ] 联网搜索
- [ ] API 后台管理
- [ ] Prompt 预设模板
- [ ] 数据分析图表

