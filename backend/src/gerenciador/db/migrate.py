"""Apply Alembic migrations from code."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine

from gerenciador.db.session import create_db_engine, database_url, prepare_database_file

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"


def run_migrations(url: str) -> None:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


def init_database(path: Path) -> Engine:
    prepare_database_file(path)
    run_migrations(database_url(path))
    return create_db_engine(path)
