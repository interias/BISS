FROM ghcr.io/astral-sh/uv:0.11.25-python3.13-trixie-slim

# The virtual environment lives outside /app so that compose can bind-mount the
# source over /app and tests always run against the working tree.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_FROZEN=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --no-install-project
COPY . .
COPY --from=data bls /data/bls

EXPOSE 2478
CMD ["sh", "-c", "uv run alembic upgrade head && uv run python -m app.importers.bls && exec uv run fastapi run app/main.py --host 0.0.0.0 --port 2478"]
