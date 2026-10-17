from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from gerenciador.domain.contract import ContractRuleError
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    InstalmentInput,
)

MakeInput = Callable[..., ContractInput]


def test_create_without_a_plan_is_refused(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    data = make_input()
    data = ContractInput(**{**data.__dict__, "instalments": None})
    with pytest.raises(ContractRuleError) as error:
        contracts.create(ctx, data)
    assert error.value.field == "instalments"


def test_a_contract_with_no_instalments_cannot_change_its_total_without_a_plan(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contract = contracts._require(created.id)
    contract.instalments = []
    session.commit()
    data = make_input(pix_discount_cents=None)
    data = ContractInput(**{**data.__dict__, "instalments": None})
    with pytest.raises(ContractRuleError) as error:
        contracts.update(ctx, created.id, 1, data)
    assert error.value.field == "instalments"


def test_a_failed_plan_stores_nothing(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    bad = make_input(
        venue_name="Catedral",
        instalments=[InstalmentInput("2026-10", 1), InstalmentInput("2026-11", 1)],
    )
    with pytest.raises(ContractRuleError):
        contracts.update(ctx, created.id, 1, bad)
    after = contracts.get(created.id)
    assert after.version == 1
    assert after.venue_name == created.venue_name
    assert after.instalments == created.instalments
