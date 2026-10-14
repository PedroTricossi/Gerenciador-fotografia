"""Serve the built frontend: real files as files, every other page path as index.html.
A missing path that names a file (it ends in an extension) is a 404.

The app routes pages in the browser, so a reload on `/contratos/<id>` must get
index.html. Paths under `/api` never fall through to the page, so a mistyped API
path stays a problem response.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from starlette.responses import FileResponse


def mount_frontend(app: FastAPI, dist: Path) -> None:
    root = dist.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        try:
            candidate = (root / path).resolve()
        except (OSError, ValueError):
            # A path that cannot exist, such as one with a null byte, is not a page.
            raise HTTPException(status_code=404, detail="Not Found") from None
        if not candidate.is_relative_to(root):
            raise HTTPException(status_code=404, detail="Not Found")
        if candidate.is_file():
            return FileResponse(candidate)
        if Path(path).suffix:
            # A missing file (such as an old hashed asset) must not come back as
            # index.html, which the browser would refuse to run as a script.
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
