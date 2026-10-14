from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    """Who is acting and under which request. Recorded on every audit event."""

    actor: str
    request_id: str
