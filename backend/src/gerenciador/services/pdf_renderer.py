"""HTML to PDF. The engine sits behind PdfRenderer so it can be replaced."""

from typing import Any, Protocol

from weasyprint import HTML
from weasyprint.urls import URLFetcher


class PdfRenderer(Protocol):
    def render(self, html: str) -> bytes: ...


def _deny_all(url: str, *args: Any, **kwargs: Any) -> dict[str, Any]:
    """Refuse every resource request, so no input can read files or reach the network."""
    raise ValueError(f"resource fetching is disabled: {url}")


class _DenyAllFetcher(URLFetcher):  # type: ignore[misc]  # weasyprint is untyped
    """WeasyPrint 70 wants a URLFetcher instance (it reads private attributes of it)."""

    def fetch(self, url: str, headers: Any = None) -> Any:
        return _deny_all(url)


class WeasyPrintRenderer:
    def render(self, html: str) -> bytes:
        return bytes(HTML(string=html, url_fetcher=_DenyAllFetcher()).write_pdf())
