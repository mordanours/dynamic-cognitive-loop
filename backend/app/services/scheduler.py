from __future__ import annotations

from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.db.database import get_conn

_scheduler: AsyncIOScheduler | None = None


def run_stream_ttl_decay() -> dict[str, int]:
    """Archive expired inbox stream items and decay salience of aging items."""
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with get_conn() as conn:
        archived_cur = conn.execute(
            """
            UPDATE stream_items
            SET status = 'decayed_archived', salience_score = 0.0
            WHERE status = 'inbox' AND expires_at <= ?
            """,
            (now_iso,),
        )
        # Mild salience decay for remaining inbox items
        decayed_cur = conn.execute(
            """
            UPDATE stream_items
            SET salience_score = MAX(0.1, ROUND(salience_score * 0.85, 3))
            WHERE status = 'inbox'
            """
        )
        return {
            "archived_count": archived_cur.rowcount,
            "decayed_count": decayed_cur.rowcount,
        }


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(run_stream_ttl_decay, "interval", minutes=60, id="stream_ttl_decay")
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
