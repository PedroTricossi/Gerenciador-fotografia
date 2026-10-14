import os

import pytest

from gerenciador.services.crypto import DecryptionError, FieldCipher, field_context

CONTEXT = field_context("clients", "cpf_encrypted", "row-1")


def test_round_trip(cipher: FieldCipher) -> None:
    token = cipher.encrypt("12345678909", context=CONTEXT)
    assert token.startswith("v1:")
    assert "12345678909" not in token
    assert cipher.decrypt(token, context=CONTEXT) == "12345678909"


def test_round_trip_non_ascii(cipher: FieldCipher) -> None:
    address = "Rua São João 10 - Água Verde"
    assert cipher.decrypt(cipher.encrypt(address, context=CONTEXT), context=CONTEXT) == address


def test_same_plaintext_encrypts_differently(cipher: FieldCipher) -> None:
    assert cipher.encrypt("x", context=CONTEXT) != cipher.encrypt("x", context=CONTEXT)


def test_wrong_key_fails(cipher: FieldCipher) -> None:
    token = cipher.encrypt("secret", context=CONTEXT)
    other = FieldCipher(os.urandom(32), os.urandom(32))
    with pytest.raises(DecryptionError):
        other.decrypt(token, context=CONTEXT)


def test_wrong_context_fails(cipher: FieldCipher) -> None:
    token = cipher.encrypt("secret", context=CONTEXT)
    with pytest.raises(DecryptionError):
        cipher.decrypt(token, context=field_context("clients", "cpf_encrypted", "row-2"))


@pytest.mark.parametrize("token", ["", "v1:", "v1:not-base64!", "v2:AAAA", "garbage"])
def test_malformed_tokens_fail(cipher: FieldCipher, token: str) -> None:
    with pytest.raises(DecryptionError):
        cipher.decrypt(token, context=CONTEXT)


def test_tampered_token_fails(cipher: FieldCipher) -> None:
    token = cipher.encrypt("secret", context=CONTEXT)
    flipped = token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1]
    with pytest.raises(DecryptionError):
        cipher.decrypt(flipped, context=CONTEXT)


def test_cpf_lookup_is_deterministic_and_keyed(cipher: FieldCipher) -> None:
    lookup = cipher.cpf_lookup("12345678909")
    assert lookup == cipher.cpf_lookup("12345678909")
    assert lookup != cipher.cpf_lookup("98765432100")
    assert len(lookup) == 64
    assert "12345678909" not in lookup
    assert FieldCipher(os.urandom(32), os.urandom(32)).cpf_lookup("12345678909") != lookup
