import datetime as dt

import pytest

from gerenciador.domain.overview import (
    Leg,
    Trip,
    group_trips,
    guide,
    median_cents,
    palette_slots,
    period_bounds,
    share_tenths,
    upcoming_months,
)

D = dt.date(2026, 5, 1)


def test_period_bounds():
    assert period_bounds("month", "2026-02") == (dt.date(2026, 2, 1), dt.date(2026, 2, 28))
    assert period_bounds("year", "2026") == (dt.date(2026, 1, 1), dt.date(2026, 12, 31))


@pytest.mark.parametrize(
    ("period", "value"),
    [
        ("month", "2026-13"),
        ("year", "26"),
        ("month", "2026"),
        ("year", "2026-01"),
        ("week", "2026"),
    ],
)
def test_period_bounds_rejects_bad_values(period, value):
    with pytest.raises(ValueError):
        period_bounds(period, value)


def test_upcoming_months():
    assert upcoming_months("2026-11", None) == ["2026-12", "2027-01", "2027-02"]
    months = upcoming_months("2026-10", "2027-04")
    assert len(months) == 6
    assert months[-1] == "2027-04"
    assert len(upcoming_months("2026-10", "2029-04")) == 24
    assert upcoming_months("2026-10", "2026-09") == ["2026-11", "2026-12", "2027-01"]


def test_palette_slots():
    slots = palette_slots([f"t{i}" for i in range(10)])
    assert slots["t0"] == 0
    assert slots["t7"] == 7
    assert slots["t8"] is None
    assert slots["t9"] is None


def test_share_tenths():
    assert share_tenths(500, 3960) == 126
    assert share_tenths(86, 3960) == 22
    assert share_tenths(1, 0) is None
    assert share_tenths(5000, 3960) is None


def test_median_cents():
    assert median_cents([70, 120, 92]) == 92
    assert median_cents([100, 101]) == 101
    with pytest.raises(ValueError):
        median_cents([])


def test_group_trips_sums_legs():
    legs = [
        Leg("c1", "wedding", dt.date(2026, 5, 2), 4300, 320, dt.time(13, 30), "ride_app"),
        Leg("c1", "wedding", dt.date(2026, 5, 1), 4300, None, None, None),
    ]
    assert group_trips(legs) == [
        Trip("c1", "wedding", dt.date(2026, 5, 1), 8600, 320, dt.time(13, 30), "ride_app")
    ]


def test_group_trips_skips_trips_without_distance_and_splits_by_event_kind():
    legs = [
        Leg("c0", "wedding", D, 1000, None, None, None),
        Leg("c1", "wedding", D, 2000, 100, None, "car"),
        Leg("c1", "prewedding", D, 3000, 50, None, "bus"),
    ]
    trips = group_trips(legs)
    assert {(t.contract_id, t.event_kind, t.cost_cents) for t in trips} == {
        ("c1", "wedding", 2000),
        ("c1", "prewedding", 3000),
    }


def trip(distance, cost, day=D, at=None, kind=None):
    return Trip("c", "wedding", day, cost, distance, at, kind)


def test_guide_similar_and_typical():
    trips = [trip(300, 7000), trip(320, 9200), trip(340, 12000), trip(900, 30000)]
    result = guide(trips, 320, None)
    assert result.trips_total == 4
    assert [t.distance_tenths for t in result.similar] == [320, 300, 340]
    assert {t.cost_cents for t in result.similar} == {7000, 9200, 12000}
    assert (result.typical_cents, result.min_cents, result.max_cents) == (9200, 7000, 12000)


def test_guide_few_similar_has_no_typical():
    result = guide([trip(300, 7000), trip(320, 9200), trip(900, 30000)], 320, None)
    assert len(result.similar) == 2
    assert result.typical_cents is None
    assert result.min_cents is None
    assert result.max_cents is None


def test_guide_without_distance_has_no_similar():
    trips = [trip(100, 1000, kind="car") for _ in range(3)]
    result = guide(trips, None, None)
    assert result.similar == []
    assert result.typical_cents is None
    assert result.per_km_by_kind == {"car": 100}


def test_guide_window_is_the_larger_of_15km_and_25_percent():
    # 15 km = 150 tenths wins for short trips; 25% wins for long ones.
    assert len(guide([trip(250, 1)], 100, None).similar) == 1
    assert len(guide([trip(251, 1)], 100, None).similar) == 0
    assert len(guide([trip(1250, 1)], 1000, None).similar) == 1
    assert len(guide([trip(1251, 1)], 1000, None).similar) == 0


def test_guide_per_kind_needs_three_trips():
    trips = [trip(100, 1000, kind="car"), trip(100, 2000, kind="car"), trip(100, 3000, kind="car")]
    trips += [trip(100, 500, kind="bus"), trip(100, 500, kind="bus"), trip(100, 500)]
    # 1000 cents over 10 km = 100 centavos/km; median of 100, 200, 300.
    assert guide(trips, None, None).per_km_by_kind == {"car": 200}


def test_guide_day_night_split():
    day = [trip(100, 1000, at=dt.time(17, 59)) for _ in range(3)]
    night = [trip(100, 3000, at=dt.time(18, 0)) for _ in range(3)]
    result = guide(day + night, None, None)
    assert (result.day_per_km, result.night_per_km) == (100, 300)
    assert guide(day + night[:2], None, None).day_per_km is None
    assert guide(day + night[:2], None, None).night_per_km is None


def test_guide_orders_same_side_then_distance_then_newest():
    night_far = trip(330, 1, at=dt.time(20, 0))
    night_near = trip(321, 2, at=dt.time(20, 0))
    day_exact = trip(320, 3, at=dt.time(9, 0))
    old = trip(310, 4, day=dt.date(2025, 1, 1))
    new = trip(310, 5, day=dt.date(2026, 1, 1))
    result = guide([day_exact, night_far, night_near, old, new], 320, dt.time(21, 0))
    assert [t.cost_cents for t in result.similar] == [2, 1, 3, 5, 4]
    result = guide([old, new], 320, None)
    assert [t.cost_cents for t in result.similar] == [5, 4]


def test_group_trips_takes_the_largest_distance():
    legs = [
        Leg("c1", "wedding", dt.date(2026, 5, 1), 100, 200, None, None),
        Leg("c1", "wedding", dt.date(2026, 5, 2), 100, 320, None, None),
    ]
    assert group_trips(legs)[0].distance_tenths == 320


def test_group_trips_takes_the_earliest_departure_and_its_kind():
    legs = [
        Leg("c1", "wedding", dt.date(2026, 5, 1), 100, 200, dt.time(15, 0), "bus"),
        Leg("c1", "wedding", dt.date(2026, 5, 2), 100, 200, dt.time(9, 0), "car"),
    ]
    trip_ = group_trips(legs)[0]
    assert (trip_.left_home_at, trip_.transport_kind) == (dt.time(9, 0), "car")


def test_group_trips_without_times_uses_the_first_leg_kind():
    legs = [
        Leg("c1", "wedding", dt.date(2026, 5, 2), 100, 200, None, "car"),
        Leg("c1", "wedding", dt.date(2026, 5, 1), 100, 200, None, "bus"),
    ]
    trip_ = group_trips(legs)[0]
    assert (trip_.left_home_at, trip_.transport_kind) == (None, "bus")


def test_guide_window_uses_a_true_ceiling():
    # 25% of 601 is 150.25 -> window 151.
    assert len(guide([trip(752, 1)], 601, None).similar) == 1
    assert len(guide([trip(753, 1)], 601, None).similar) == 0
    assert len(guide([trip(450, 1)], 601, None).similar) == 1
    assert len(guide([trip(449, 1)], 601, None).similar) == 0
