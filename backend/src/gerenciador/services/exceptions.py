"""Errors services raise. The API layer maps each to an HTTP status."""


class NotFoundError(Exception):
    def __init__(self, entity: str, entity_id: str) -> None:
        super().__init__(f"{entity} not found")
        self.entity = entity
        self.entity_id = entity_id


class ConflictError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class StaleVersionError(Exception):
    """The caller's version of a contract is not the current one."""


class InvalidCursorError(Exception):
    """A pagination cursor could not be decoded."""
