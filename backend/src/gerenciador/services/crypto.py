"""Field-level encryption for personal data at rest."""

import base64
import hashlib
import hmac
import os
from typing import Self

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from gerenciador.config import Settings

_VERSION = "v1"
_NONCE_BYTES = 12


class DecryptionError(Exception):
    """A stored value could not be decrypted."""


def field_context(table: str, column: str, row_id: str) -> str:
    """Associated data binding a ciphertext to one column of one row."""
    return f"{table}.{column}:{row_id}"


class FieldCipher:
    def __init__(self, encryption_key: bytes, lookup_key: bytes) -> None:
        self._aead = AESGCM(encryption_key)
        self._lookup_key = lookup_key

    @classmethod
    def from_settings(cls, settings: Settings) -> Self:
        return cls(settings.encryption_key_bytes(), settings.lookup_key_bytes())

    def encrypt(self, plaintext: str, *, context: str) -> str:
        nonce = os.urandom(_NONCE_BYTES)
        sealed = self._aead.encrypt(nonce, plaintext.encode("utf-8"), context.encode("utf-8"))
        return f"{_VERSION}:{base64.urlsafe_b64encode(nonce + sealed).decode('ascii')}"

    def decrypt(self, token: str, *, context: str) -> str:
        version, _, payload = token.partition(":")
        if version != _VERSION:
            raise DecryptionError("unknown key version")
        try:
            raw = base64.urlsafe_b64decode(payload)
            plaintext = self._aead.decrypt(
                raw[:_NONCE_BYTES], raw[_NONCE_BYTES:], context.encode("utf-8")
            )
        except (InvalidTag, ValueError) as exc:
            raise DecryptionError("could not decrypt field") from exc
        return plaintext.decode("utf-8")

    def cpf_lookup(self, cpf_digits: str) -> str:
        return hmac.new(self._lookup_key, cpf_digits.encode("ascii"), hashlib.sha256).hexdigest()
