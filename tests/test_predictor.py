from backend.predictor import (
    BUCKETS,
    _bucket_for,
    _confidence_from_ratio,
    _pick_weights,
    HistoricalRank,
)


def test_weights_dispatch():
    assert _pick_weights(0) == (1.0,)
    assert _pick_weights(1) == (1.0,)
    assert _pick_weights(2) == (0.6, 0.4)
    assert _pick_weights(3) == (0.5, 0.3, 0.2)
    assert _pick_weights(5) == (0.5, 0.3, 0.2)


def test_confidence_monotonic():
    cs = [_confidence_from_ratio(r) for r in (0.5, 0.8, 1.0, 1.2, 1.5)]
    assert all(a < b for a, b in zip(cs, cs[1:]))


def test_confidence_at_parity():
    assert abs(_confidence_from_ratio(1.0) - 0.5) < 1e-6


def test_bucket_thresholds():
    assert _bucket_for(0.90) == "SAFE"
    assert _bucket_for(0.60) == "HIGH"
    assert _bucket_for(0.45) == "BORDERLINE"
    assert _bucket_for(0.25) == "LOW"
    assert _bucket_for(0.05) == "UNLIKELY"


def test_bucket_boundary_inclusive():
    # exactly 0.80 should still be SAFE (threshold is inclusive)
    assert _bucket_for(0.80) == "SAFE"
    assert _bucket_for(0.55) == "HIGH"


def test_bucket_order_matches_thresholds():
    thresholds = [t for _, t in BUCKETS]
    assert thresholds == sorted(thresholds, reverse=True)
