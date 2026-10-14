"""Write the API's OpenAPI schema to a file: `python -m gerenciador.export_openapi [path]`.

The running app serves no schema and no documentation page. This builds the schema
from the route definitions alone, so it needs no `.env` and never opens the database.
"""

import json
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from gerenciador import API_PREFIX, APP_TITLE, APP_VERSION
from gerenciador.api.v1 import api_router

DEFAULT_PATH = Path("openapi.json")


def build_schema() -> dict[str, Any]:
    app = FastAPI(title=APP_TITLE, version=APP_VERSION)
    app.include_router(api_router, prefix=API_PREFIX)
    return app.openapi()


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    path = Path(args[0]) if args else DEFAULT_PATH
    path.write_text(
        json.dumps(build_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"OpenAPI schema written to {path}")


if __name__ == "__main__":
    main()
