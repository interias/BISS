"""FastAPI application."""

from fastapi import FastAPI

from app import VERSION
from app.api import days, entries, foods, health, images, labels

app = FastAPI(title="BISS API", version=VERSION)
app.include_router(health.router, prefix="/api/v1")
app.include_router(days.router, prefix="/api/v1")
app.include_router(entries.router, prefix="/api/v1")
app.include_router(foods.router, prefix="/api/v1")
app.include_router(images.router, prefix="/api/v1")
app.include_router(labels.router, prefix="/api/v1")
