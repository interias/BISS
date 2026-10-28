"""FastAPI application."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import VERSION, mcp
from app.api import days, entries, foods, goals, health, images, labels, plates

mcp_http = mcp.StreamableHttp(mcp.build_server())


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    async with mcp_http.lifespan():
        yield


app = FastAPI(title="BISS API", version=VERSION, lifespan=lifespan)
app.include_router(health.router, prefix="/api/v1")
app.include_router(days.router, prefix="/api/v1")
app.include_router(entries.router, prefix="/api/v1")
app.include_router(foods.router, prefix="/api/v1")
app.include_router(goals.router, prefix="/api/v1")
app.include_router(images.router, prefix="/api/v1")
app.include_router(labels.router, prefix="/api/v1")
app.include_router(plates.router, prefix="/api/v1")
# MCP server (ADR-0007), outside /api/v1 and the OpenAPI schema.
app.router.add_route(mcp.PATH, mcp_http, include_in_schema=False)
