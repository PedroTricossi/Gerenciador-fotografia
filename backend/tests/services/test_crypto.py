import base64
import os

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from gerenciador.config import Settings
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


def test_authentic_but_undecodable_plaintext_fails_as_a_decryption_error(
    cipher: FieldCipher, settings: Settings
) -> None:
    nonce = os.urandom(12)
    sealed = AESGCM(settings.encryption_key_bytes()).encrypt(
        nonce, b"\xff\xfe\xfd", CONTEXT.encode("utf-8")
    )
    token = "v1:" + base64.urlsafe_b64encode(nonce + sealed).decode("ascii")
    with pytest.raises(DecryptionError):
        cipher.decrypt(token, context=CONTEXT)


@pytest.mark.parametrize(
    ("encryption_bytes", "lookup_bytes"), [(16, 32), (24, 32), (32, 16), (32, 24), (32, 33)]
)
def test_both_keys_must_be_exactly_32_bytes(encryption_bytes: int, lookup_bytes: int) -> None:
    encryption_key = os.urandom(encryption_bytes)
    lookup_key = os.urandom(lookup_bytes)
    with pytest.raises(ValueError, match="32 bytes") as error:
        FieldCipher(encryption_key, lookup_key)
    message = str(error.value)
    for key in (encryption_key, lookup_key):
        assert key.hex() not in message
        assert base64.urlsafe_b64encode(key).decode("ascii") not in message
        assert repr(key) not in message
