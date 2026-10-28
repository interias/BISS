"""Tests run against the Postgres container in a separate database (SPEC 8)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import get_settings

TEST_DATABASE = "biss_test"
API_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Recreate the test database and migrate it to head."""
    url = make_url(get_settings().database_url)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f"DROP DATABASE IF EXISTS {TEST_DATABASE} WITH (FORCE)"))
        connection.execute(text(f"CREATE DATABASE {TEST_DATABASE}"))
    admin.dispose()

    test_url = url.set(database=TEST_DATABASE)
    config = Config(API_DIR / "alembic.ini")
    config.attributes["database_url"] = test_url.render_as_string(hide_password=False)
    command.upgrade(config, "head")

    test_engine = create_engine(test_url)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """A session whose work, commits included, is rolled back after the test."""
    with engine.connect() as connection:
        transaction = connection.begin()
        db_session = Session(bind=connection, join_transaction_mode="create_savepoint")
        yield db_session
        db_session.close()
        transaction.rollback()
