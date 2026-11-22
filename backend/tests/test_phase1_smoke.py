from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_phase1_non_llm_closed_loop_and_schemas() -> None:
    with TestClient(app) as client:
        # 1. Health check
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

        # 2. Seeded schemas for investing & learning
        schemas = client.get("/api/nodes/schemas").json()
        domains = {(s["domain_slug"], s["version"]) for s in schemas}
        assert ("investing", 1) in domains
        assert ("investing", 2) in domains
        assert ("learning", 1) in domains
        assert ("learning", 2) in domains

        # 3. Profile & bandwidth toggle
        prof = client.get("/api/profile").json()
        assert prof["current_bandwidth"] in ("low", "medium", "high")
        r = client.patch("/api/profile/bandwidth", json={"bandwidth": "low"})
        assert r.status_code == 200
        assert r.json()["current_bandwidth"] == "low"
        client.patch("/api/profile/bandwidth", json={"bandwidth": "medium"})

        # 4. Stream item creation & listing
        r = client.post(
            "/api/stream",
            json={
                "raw_content": "今天和AI讨论了定投再平衡与仓位控制，核心是不要在单只高波动资产上超过5%仓位。",
                "domain_hint": "investing",
            },
        )
        assert r.status_code == 200
        stream_item = r.json()
        assert stream_item["status"] == "inbox"
        assert stream_item["token_count"] > 0

        # Cleanup test stream item
        del_r = client.delete(f"/api/stream/{stream_item['id']}")
        assert del_r.status_code == 200

        # 5. Metrics & LLM settings endpoints
        metrics = client.get("/api/metrics").json()
        assert "dcr_percent" in metrics
        llm_cfg = client.get("/api/settings/llm").json()
        assert "deepseek" in llm_cfg["profiles"]
        assert "local" in llm_cfg["profiles"]
