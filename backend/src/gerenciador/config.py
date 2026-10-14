"""Application settings, read from the repository's .env file."""

import base64
import os
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from gerenciador.domain.cpf import normalize_cpf

REPO_ROOT = Path(__file__).resolve().parents[3]
_KEY_BYTES = 32
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})


def generate_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(_KEY_BYTES)).decode("ascii")


def _decode_key(value: SecretStr) -> bytes:
    return base64.urlsafe_b64decode(value.get_secret_value())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    contractor_name: str
    contractor_cpf: str
    contractor_address: str
    contractor_representative: str
    field_encryption_key: SecretStr
    cpf_lookup_key: SecretStr
    database_path: Path = REPO_ROOT / "data" / "gerenciador.db"
    template_path: Path = REPO_ROOT / "base_contract" / "contract_template.md"
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"
    host: str = "127.0.0.1"
    port: int = 8000

    @field_validator("contractor_cpf")
    @classmethod
    def _contractor_cpf_is_valid(cls, value: str) -> str:
        return normalize_cpf(value)

    @field_validator("field_encryption_key", "cpf_lookup_key")
    @classmethod
    def _key_is_32_bytes(cls, value: SecretStr) -> SecretStr:
        try:
            raw = _decode_key(value)
        except ValueError as exc:
            raise ValueError("must be urlsafe base64") from exc
        if len(raw) != _KEY_BYTES:
            raise ValueError("must decode to exactly 32 bytes")
        return value

    @field_validator("host")
    @classmethod
    def _host_is_loopback(cls, value: str) -> str:
        if value not in _LOOPBACK_HOSTS:
            raise ValueError(
                "refusing to bind outside loopback: this version has no authentication"
            )
        return value

    @model_validator(mode="after")
    def _keys_differ(self) -> Self:
        if self.field_encryption_key.get_secret_value() == self.cpf_lookup_key.get_secret_value():
            raise ValueError("field_encryption_key and cpf_lookup_key must differ")
        return self

    def encryption_key_bytes(self) -> bytes:
        return _decode_key(self.field_encryption_key)

    def lookup_key_bytes(self) -> bytes:
        return _decode_key(self.cpf_lookup_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
