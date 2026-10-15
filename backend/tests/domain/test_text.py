import pytest

from gerenciador.domain.text import fold


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Pré-Wedding", "pre-wedding"),
        ("ÁLBUM", "album"),
        ("Diária", "diaria"),
        ("straße", "strasse"),
        ("", ""),
    ],
)
def test_fold_ignores_case_and_accents(text: str, expected: str) -> None:
    assert fold(text) == expected
