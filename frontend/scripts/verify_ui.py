"""UI redesign verification.

1. WCAG contrast assertions for token text/background pairs actually used in the UI.
2. Static scan: no legacy dark-theme palette classes remain in src/.
3. Playwright (local Edge) screenshots of every view at 1440 and 390 widths against a mocked API,
   asserting no console errors and that key elements render.

Run from frontend/ with `pnpm preview --port 4173` running:  python scripts/verify_ui.py
"""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:4173"

# ---------------------------------------------------------------- 1. contrast
css = (ROOT / "src" / "index.css").read_text(encoding="utf-8")
tokens = dict(re.findall(r"--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", css))


def lum(hex_: str) -> float:
    rgb = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(fg: str, bg: str) -> float:
    a, b = sorted([lum(tokens[fg] if fg in tokens else fg), lum(tokens[bg] if bg in tokens else bg)], reverse=True)
    return (a + 0.05) / (b + 0.05)


# (fg, bg, min) — body text needs 4.5; large/bold UI text (>=14px bold) 3.0
PAIRS = [
    ("ink", "paper", 4.5), ("ink-soft", "surface", 4.5), ("ink-muted", "surface", 4.5),
    ("ink-muted", "paper", 4.5), ("ink-muted", "paper-2", 4.5), ("ink-soft", "paper-2", 4.5),
    ("leaf-700", "leaf-50", 4.5), ("mind-700", "mind-50", 4.5), ("sun-700", "sun-50", 4.5),
    ("clay-700", "clay-50", 4.5), ("coral-700", "coral-50", 4.5), ("leaf-800", "leaf-50", 4.5),
    ("leaf-700", "surface", 4.5), ("mind-700", "surface", 4.5), ("clay-700", "surface", 4.5),
    ("#ffffff", "leaf-600", 4.5), ("#ffffff", "mind-600", 4.5), ("#ffffff", "coral-600", 4.5),
    ("#ffffff", "leaf-700", 4.5), ("#ffffff", "mind-700", 4.5),  # hover states
    ("ink", "sun-300", 4.5), ("ink", "sun-100", 4.5),
]
failures = []
for fg, bg, need in PAIRS:
    r = ratio(fg, bg)
    ok = r >= need
    print(f"{'PASS' if ok else 'FAIL'} contrast {fg:>10} on {bg:<9} {r:5.2f} (>= {need})")
    if not ok:
        failures.append((fg, bg, r))
assert not failures, f"contrast failures: {failures}"

# ---------------------------------------------------------------- 2. legacy palette scan
legacy = re.compile(r"(?<![a-z-])(?:bg|text|border|from|to|via|ring|shadow|fill|stroke)-(?:slate|indigo|violet|cyan|emerald|amber|rose|orange|gray|zinc)-\d")
tiny = re.compile(r"text-\[(?:9|10|11)px\]")
hits = []
for f in (ROOT / "src").rglob("*.tsx"):
    for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
        if legacy.search(line) or tiny.search(line):
            hits.append(f"{f.name}:{i}: {line.strip()[:100]}")
print(f"legacy palette / tiny text hits: {len(hits)}")
for h in hits:
    print("  ", h)
assert not hits, "legacy classes remain"

# ---------------------------------------------------------------- 3. screenshots
now = "2026-11-28T08:00:00"
domains = [
    {"id": "d1", "slug": "ai-eng", "name": "AI 工程架构", "description": "Agent 系统与评测", "color": "", "sort_order": 0, "is_archived": 0},
    {"id": "d2", "slug": "health", "name": "健康管理", "description": "睡眠、运动与饮食", "color": "", "sort_order": 1, "is_archived": 0},
    {"id": "d3", "slug": "investing", "name": "投资决策", "description": "", "color": "", "sort_order": 2, "is_archived": 0},
]
folders = [
    {"id": "f0", "domain_slug": "ai-eng", "folder_name": "核心认知", "parent_id": None, "is_system": 1, "created_at": now},
    {"id": "f1", "domain_slug": "ai-eng", "folder_name": "评测方法", "parent_id": None, "is_system": 0, "created_at": now},
    {"id": "f2", "domain_slug": "ai-eng", "folder_name": "离线评测", "parent_id": "f1", "is_system": 0, "created_at": now},
]


def node(i, dom, typ, folder, kw, title, claim, w, c, rich=False):
    return {
        "id": f"n{i}", "domain_slug": dom, "schema_version": 2, "node_type": typ,
        "folder_path": f"{dom}/{folder}", "short_keyword": kw, "title": title, "atomic_claim": claim,
        "payload": {"适用边界": "仅在样本量足够时成立", "反例": "冷启动阶段"},
        "rich_blocks": [{"title": "对比表", "markdown": "| 方法 | 成本 | 可信度 |\n|---|---|---|\n| 人工 | 高 | 高 |\n| LLM 裁判 | 低 | 中 |"}] if rich else [],
        "attachments": [], "confidence": c, "conversion_weight": w, "status": "active",
        "needs_verification": 1 if i == 2 else 0, "created_at": now,
    }


nodes = [
    node(1, "ai-eng", "knowledge", "评测方法", "LLM-as-Judge", "LLM 裁判需要校准集", "用 **50 条人工标注** 校准裁判模型，偏差 > 10% 时不得上线。", 0.72, 0.8, rich=True),
    node(2, "ai-eng", "decision", "评测方法/离线评测", "先离线后在线", "每次改 prompt 先跑离线回归", "改动前后在固定集上对比，回归即回滚。\n\n- 固定随机种子\n- 记录 `config_hash`", 0.55, 0.62),
    node(3, "ai-eng", "decision", "核心认知", "小步提交", "每个可验证里程碑都提交", "提交信息写明验证了什么。", 0.88, 0.9),
    node(4, "health", "knowledge", "核心认知", "睡眠压力", "腺苷累积决定困意", "午后咖啡因会推迟入睡时间约 40 分钟。", 0.4, 0.7),
    node(5, "health", "decision", "核心认知", "14 点后不喝咖啡", "下午两点后停止咖啡因", "连续 7 天记录入睡时间。", 0.66, 0.5),
]
actions = [
    {"id": "a1", "node_id": "n2", "node_title": "每次改 prompt 先跑离线回归", "domain_slug": "ai-eng",
     "theoretical_basis": "回归测试 / 变更控制", "hypothesis": "", "trigger_condition": "当我准备合并任何 prompt 修改时",
     "micro_action": "先运行 eval:offline 并贴出对比表", "success_metric": "本周 3 次合并均附带对比结果",
     "bandwidth_cost": "low", "status": "active", "created_at": now},
    {"id": "a2", "node_id": "n5", "node_title": "下午两点后停止咖啡因", "domain_slug": "health",
     "theoretical_basis": "腺苷受体拮抗半衰期约 5 小时", "hypothesis": "", "trigger_condition": "当下午想喝咖啡时",
     "micro_action": "改喝一杯温水并散步 5 分钟", "success_metric": "连续 5 天入睡 < 20 分钟",
     "bandwidth_cost": "low", "status": "active", "created_at": now},
]
state = {"bandwidth": "medium"}
streams = [{"id": "s1", "source": "paste", "domain_hint": "ai-eng", "raw_content": "关于 RAG 评测的长对话：召回率、忠实度、答案相关性……",
            "token_count": 2400, "status": "inbox", "created_at": "2026-11-24T08:00:00"}]
llm = {"active_provider": "deepseek", "profiles": {k: {"label": k, "base_url": "https://api.example.com", "api_key": "", "fast_model": "fast", "reasoning_model": "reason", "has_api_key": True, "api_key_masked": "sk-****"} for k in ("deepseek", "openai_compatible", "local")},
       "vision": {"enabled": False, "base_url": "", "api_key": "", "model": ""}}


def api_payload(path: str, method: str):
    p = path.split("?")[0]
    if p == "/api/auth/config": return {"invite_required": True, "has_users": True}
    if p == "/api/auth/me": return {"id": "u1", "nickname": "Mordan", "role": "admin"}
    if p == "/api/metrics": return {"dcr_percent": 62, "avg_compression_ratio": 8.4, "avg_conversion_weight": 0.6, "stream_total": 12, "stream_inbox": 1, "nodes_total": 5, "actions_total": 4, "actions_verified": 3, "actions_succeeded": 2}
    if p == "/api/profile": return {"current_bandwidth": state["bandwidth"], "domain_mastery": {}}
    if p == "/api/profile/bandwidth": return {"current_bandwidth": state["bandwidth"]}
    if p == "/api/domains": return domains
    if p == "/api/stream": return streams
    if p == "/api/nodes": return nodes
    if p == "/api/actions": return actions
    if p == "/api/architect/proposals": return []
    if p == "/api/socratic/due": return {"suppressed_by_low_bandwidth": False, "due_nodes": [nodes[0]]}
    if p == "/api/socratic/history": return []
    if p == "/api/nodes/folders": return folders
    if p == "/api/settings/llm": return llm
    if p.startswith("/api/architect/schema-status"): return {"domain_slug": "ai-eng", "current_version": 2, "current_tier": 1, "next_version": 3, "suggested_fields": [], "actions_verified": 3, "socratic_logs_count": 2, "recommended_threshold": 5, "active_nodes_to_migrate": 3}
    return {}


VIEWS = [  # name, setup(page, mobile)
    ("01-login", None),
    ("02-home", "home"),
    ("03-domain", "domain"),
    ("04-tree", "tree"),
    ("05-low", "low"),
    ("06-capture", "capture"),
    ("07-audit", "audit"),
    ("08-settings", "settings"),
    ("09-socratic", "socratic"),
]

errors_all = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge")
    for width, height, tag in ((1440, 960, "desktop"), (390, 844, "mobile")):
        for name, view in VIEWS:
            ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1, reduced_motion="reduce")
            page = ctx.new_page()
            errs = []
            page.on("console", lambda m, errs=errs: errs.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e, errs=errs: errs.append(str(e)))

            def handle(route, request):
                body = request.post_data or ""
                if "/api/profile/bandwidth" in request.url and body:
                    state["bandwidth"] = json.loads(body).get("bandwidth", state["bandwidth"])
                route.fulfill(status=200, content_type="application/json",
                              body=json.dumps(api_payload(request.url.replace(BASE, ""), request.method), ensure_ascii=False))

            page.route("**/api/**", handle)
            state["bandwidth"] = "low" if view == "low" else "medium"
            if view:
                page.add_init_script("localStorage.setItem('dcl_auth_token','test-token')")
            page.goto(BASE + "/")
            page.wait_for_load_state("networkidle")

            if view is None:
                page.get_by_text("登录工作台").wait_for()
            elif view == "home":
                page.get_by_text("AI 工程架构").first.wait_for()
            elif view == "domain":
                page.get_by_role("button", name="进入").first.click()
                page.get_by_text("LLM 裁判需要校准集").wait_for()
            elif view == "tree":
                if width < 768:
                    page.locator("nav").get_by_text("知识树").click()
                else:
                    page.get_by_role("tab", name="知识树").click()
                page.locator("canvas").wait_for()
                page.wait_for_timeout(600)
            elif view == "low":
                page.get_by_text("休眠模式").wait_for()
            elif view == "capture":
                if width < 768:
                    page.get_by_label("捕获对话").click()
                else:
                    page.get_by_label("打开交互流捕获").click()
                page.get_by_text("播下一颗认知种子").wait_for()
            elif view == "audit":
                page.get_by_role("button", name="进入").first.click()
                page.get_by_text("提交真实反馈").first.click()
                page.get_by_role("dialog").wait_for()
            elif view == "settings":
                page.get_by_title("模型设置").click()
                page.get_by_role("dialog").wait_for()
            elif view == "socratic":
                if width < 768:
                    page.locator("nav").get_by_text("陪练").click()
                else:
                    page.get_by_role("button", name=re.compile("陪练")).first.click()
                page.get_by_role("dialog").wait_for()
            page.wait_for_timeout(1600 if view is None else 500)

            if view == "domain":
                n_fresh = page.locator(".ring-leaf-200").count()
                assert n_fresh == 0, f"initial load must not mark cards fresh, got {n_fresh}"
            # LivingBackground must sit inside an isolated stacking context (else body bg hides it)
            iso = page.evaluate(
                "(() => { const b = document.querySelector('.blur-3xl'); if (!b) return 'none';"
                " let e = b.parentElement; while (e && e !== document.body) {"
                " if (getComputedStyle(e).isolation === 'isolate') return 'ok'; e = e.parentElement; } return 'missing'; })()"
            )
            if view not in ("low",):
                assert iso == "ok", f"{name}: background blobs not isolated ({iso})"

            # Rendered font must be the new family
            ff = page.evaluate("getComputedStyle(document.body).fontFamily")
            assert "Nunito" in ff, f"body font not applied: {ff}"
            bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
            assert bg in ("rgb(251, 250, 246)",), f"body bg not paper: {bg}"
            # no horizontal overflow on mobile
            if width < 768:
                sw = page.evaluate("document.documentElement.scrollWidth")
                assert sw <= width + 1, f"{name} mobile horizontal overflow: {sw}px"

            out = SHOTS / f"{tag}-{name}.png"
            page.screenshot(path=str(out), full_page=view in ("home", "domain"))
            real_errs = [e for e in errs if "favicon" not in e]
            print(f"{'OK ' if not real_errs else 'ERR'} {tag:<7} {name:<12} font=Nunito bg=paper -> {out.name}")
            if real_errs:
                errors_all.append((tag, name, real_errs[:3]))
            ctx.close()
    browser.close()

assert not errors_all, f"console errors: {errors_all}"
print("ALL UI CHECKS PASSED")
