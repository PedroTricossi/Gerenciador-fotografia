"""Text keys for comparing and sorting names the way a person reads them."""

import unicodedata


def fold(text: str) -> str:
    """Lower case without accents: "Pré-Wedding" and "pre-wedding" fold alike."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()
