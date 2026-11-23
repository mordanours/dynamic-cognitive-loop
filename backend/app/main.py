from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routers import actions, architect, auth, domains, files, nodes, profile, settings, socratic, stream
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(
    title="Dynamic Cognitive Loop API",
    version="0.2.0",
    description="Agentic PKM Phase 2",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(domains.router)
app.include_router(files.router)
app.include_router(stream.router)
app.include_router(nodes.router)
app.include_router(actions.router)
app.include_router(profile.router)
app.include_router(settings.router)
app.include_router(architect.router)
app.include_router(socratic.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
