"""Errors services raise. The API layer maps each to an HTTP status."""


class NotFoundError(Exception):
    def __init__(self, entity: str, entity_id: str, message: str | None = None) -> None:
        super().__init__(message or f"{entity} not found")
        self.entity = entity
        self.entity_id = entity_id


class ConflictError(Exception):
    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class StaleVersionError(Exception):
    """The caller's version of a contract or service is not the current one."""

    def __init__(self, entity: str = "contract") -> None:
        super().__init__(f"{entity} changed")
        self.entity = entity


class PreconditionRequiredError(Exception):
    """An edit of something that exists was sent without the version it was based on."""


class KeyMismatchError(Exception):
    """The configured keys cannot read the personal data already in the database."""

    def __init__(self) -> None:
        super().__init__(
            "The encryption keys in the configuration do not match the database: "
            "stored client data cannot be read with them. Restore the original "
            "FIELD_ENCRYPTION_KEY and CPF_LOOKUP_KEY, or point DATABASE_PATH at the "
            "database these keys belong to."
        )


class InvalidCursorError(Exception):
    """A pagination cursor could not be decoded."""
