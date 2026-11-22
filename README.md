# Dynamic Cognitive Loop (动态认知闭环系统) - Phase 1 MVP

## 快速启动

### 1. 启动后端 (FastAPI + SQLite)
```powershell
cd e:\NotebookMyBuild\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. 启动前端 (Vite + React)
```powershell
cd e:\NotebookMyBuild\frontend
pnpm dev
```

打开浏览器访问 `http://localhost:5173`，点击右上角 **「模型设置」** 填入你的 **DeepSeek API Key**（或切换至本地 Ollama），即可开始使用。
