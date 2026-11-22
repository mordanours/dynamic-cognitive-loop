# Dynamic Cognitive Loop (动态认知闭环系统)

> **Agentic PKM（智能体驱动的动态知识与行动系统）** — 打通「AI 对话输出 → 个人认知内化 → 现实决策与行动优化」的最后一公里。

传统的双链笔记（如 Obsidian）本质上是静态存储库，容易导致数字囤积。本系统旨在解决**“AI 信息生成带宽无限”**与**“人类认知消化带宽有限”**之间的错配问题。

- **北极星指标**：不是“存储了多少字”，而是 **决策转化率（Decision Conversion Rate, DCR）**——有多少条 AI 带来的新认知，真正转化为用户的具体行动或认知校准。

---

## 核心特性

### 1. 三层动态数据流 (3-Layer Dynamic Data Flow)
* **交互流层 (Stream Layer)**：
  * 右下角**悬浮球捕获**，不占用主工作区视野。
  * **7 天 TTL 自动衰减**：通过 `APScheduler` 后台定时扫描，未提炼的过期原始对话自动降权归档，避免污染核心上下文。
* **结晶层 (Crystallized Layer)**：
  * **功能性区分**：自动区分 **知识类 (`knowledge`，名词短语)** 与 **决策类 (`decision`，动词短语)**。
  * **自定义目录 + 固定一级子目录**：支持自由新建/重命名目录并一键移动卡片，同时固定保留 `核心认知` 一级子目录。
  * **动态 Schema 演进**：支持 `v1 → v2 → v3 → ...` 无限演进，升级前由用户**自定义目标字段**，并自动融合历史苏格拉底陪练回答与现实审计反馈。
  * **Markdown 影子镜像**：SQLite 作为单一事实来源（SSOT），同时实时导出带 YAML Frontmatter 的 `.md` 文件至本地 `vault/` 目录。
* **行动与反馈层 (Action & Feedback Layer)**：
  * 将抽象认知转化为带理论依据的 **`If-Then` 微行动**。
  * 提交真实执行结果与复盘后，通过确定性校准公式实时更新结晶节点的**效用权重 (`conversion_weight`)** 与**可信度 (`confidence`)**。

### 2. 四大协同 Agent 体系
1. **认知降维器 (`Distiller`)**：对抗上下文膨胀，每次强制提炼 1~3 条高密度原子认知，显式记录丢弃的噪声并计算压缩比，同时自动查重。
2. **知行审计员 (`Execution Auditor`)**：结合用户当前精力带宽（`Low` 模式极度降维）与历史审计记忆，生成有理论支撑的简洁微实验，并在执行后完成权重校准。
3. **苏格拉底式陪练 (`Socratic Coach`)**：支持自定义选卡与 **Easy / Medium / Hard** 三档难度；构造现实两难场景题（禁止概念默写），持久化保存历史问答与建议，对比历史回答动态精简（`condense`）或补充（`enrich`）卡片密集度，并按 FSRS 间隔调度复习。
4. **数据结构架构师 (`Schema Architect`)**：扫描领域内重复/低效卡片，支持**核实原卡片内容**与**用户提建议重新合成**，人机审批后无损合并归档；同时支持自定义字段的 Schema 演进 Diff 预览与迁移。

### 3. 3D 球形知识树 & 精力带宽切换
* **3D 球形知识树**：基于原生 Canvas 3D 透视引擎，按 `认知中枢 → 领域 → 目录路径 → 原子认知关键词` 三层同心球壳布局（青色=知识类名词，翠绿=决策类动词，球体大小代表效用权重），支持 360° 拖拽旋转、滚轮缩放与点击节点直接发起陪练/行动。
* **精力带宽切换 (`Low` / `Med` / `High`)**：`Low` 模式下自动屏蔽冗余面板与陪练打扰，仅保留今日唯一待执行微行动。

---

## 技术栈

* **前端**：Vite + React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons
* **后端**：Python 3.11+ / FastAPI / Uvicorn / APScheduler / Pydantic v2 / `jsonschema`
* **存储**：SQLite 3 (WAL) + 本地 Markdown 影子镜像 (`vault/`)
* **模型接入**：统一 **OpenAI 兼容协议**，开箱支持 **DeepSeek API**、任意 OpenAI 兼容接口（OpenRouter / 硅基流动等）以及 **本地模型（Ollama / LM Studio）**，可在 Web 界面右上角「模型设置」中可视化配置与测试连接。

---

## 快速开始

### 环境要求
* Python 3.11+（推荐使用 [`uv`](https://github.com/astral-sh/uv)）
* Node.js 20+ 与 `pnpm`

### 1. 安装依赖

**后端：**
```powershell
cd backend
uv sync
```

**前端：**
```powershell
cd frontend
pnpm install
```

### 2. 启动服务

你可以直接运行根目录的一键启动脚本（Windows PowerShell）：
```powershell
.\start_dev.ps1
```

或分别启动前后端：
```powershell
# 终端 1：启动后端 (http://localhost:8000)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 终端 2：启动前端 (http://localhost:5173)
cd frontend
pnpm dev
```

### 3. 配置模型并开始使用
1. 浏览器打开 `http://localhost:5173/`。
2. 点击右上角 **「模型设置」**，选择 **DeepSeek API**（或本地 Ollama），填入 API Key 后点击 **「保存并测试连接」**。
3. 点击右下角 **悬浮球 (`+`)** 粘贴一段 AI 对话，点击 **「一键降维提炼」**，即可开启完整的认知闭环！

---

## 隐私与数据所有权
* 所有个人数据（SQLite 数据库 `backend/data/cognitive_loop.db`、模型密钥 `backend/data/llm_settings.json`、Markdown 镜像 `vault/`）均**100% 存储在本地**，并已通过 `.gitignore` 严格排除，不会上传至任何远程代码仓库。
