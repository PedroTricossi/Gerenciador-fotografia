"""Engine and session factory for the SQLite database."""

from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def database_url(path: Path) -> str:
    return f"sqlite:///{path}"


def prepare_database_file(path: Path) -> None:
    """Create the database file and its folder readable by the owner only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)


def create_db_engine(path: Path) -> Engine:
    # hide_parameters keeps personal data out of SQL logs and error messages.
    engine = create_engine(
        database_url(path), connect_args={"check_same_thread": False}, hide_parameters=True
    )

    @event.listens_for(engine, "connect")
    def _configure(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # Overwrite freed content with zeros, so anonymised data leaves the file.
        cursor.execute("PRAGMA secure_delete=ON")
        cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)
