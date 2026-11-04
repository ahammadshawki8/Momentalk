import numpy as np
import pytest

from app.cost import BudgetExceeded, CostLedger, llm_cost
from app.geometry import box_to_polygon, mask_iou, mask_to_polygons
from app.matcher import HotspotTerms, LiveMatcher
from app.sam_format import decode_mask, parse_sam_output


def make_matcher():
    return LiveMatcher([
        HotspotTerms("ball", ["ball", "football"]),
        HotspotTerms("juice", ["juice", "apple juice"]),
        HotspotTerms("grandma", ["grandma", "nana"]),
    ])


def test_matcher_reports_each_mention_once_across_partials():
    m = make_matcher()
    assert m.feed("do you want the") == []
    assert m.feed("do you want the ball") == ["ball"]
    assert m.feed("do you want the ball or the") == []
    assert m.feed("do you want the ball or the juice") == ["juice"]


def test_matcher_handles_case_punctuation_plurals_and_possessives():
    m = make_matcher()
    assert m.feed("Look, Nana's here with BALLS!") == ["grandma", "ball"]


def test_matcher_prefers_longer_phrase_and_resets_per_turn():
    m = make_matcher()
    assert m.feed("apple juice please") == ["juice"]
    m.reset_turn()
    assert m.feed("apple juice please") == ["juice"]


def test_cost_ledger_blocks_after_cap(tmp_path):
    ledger = CostLedger(tmp_path / "cost.json", cap_usd=0.01)
    ledger.check()
    ledger.record("sam", 0.02)
    with pytest.raises(BudgetExceeded):
        ledger.check()
    reloaded = CostLedger(tmp_path / "cost.json", cap_usd=0.01)
    assert reloaded.total == pytest.approx(0.02)


def test_llm_cost_uses_official_prices():
    assert llm_cost("spark", 1_000_000, 1_000_000) == pytest.approx(5.50)
    assert llm_cost("wonder", 1_000_000, 0) == pytest.approx(4.00)


def test_mask_to_polygons_finds_square():
    mask = np.zeros((100, 200), dtype=np.uint8)
    mask[20:60, 50:150] = 1
    polys = mask_to_polygons(mask)
    assert len(polys) == 1
    xs = [p[0] for p in polys[0]]
    ys = [p[1] for p in polys[0]]
    assert min(xs) == pytest.approx(0.25, abs=0.01) and max(xs) == pytest.approx(0.745, abs=0.01)
    assert min(ys) == pytest.approx(0.2, abs=0.01) and max(ys) == pytest.approx(0.59, abs=0.01)


def test_box_polygon_and_iou():
    assert box_to_polygon((0, 0, 50, 100), 100, 100)[2] == [0.5, 1.0]
    a = np.zeros((10, 10)); a[:5] = 1
    b = np.zeros((10, 10)); b[:, :5] = 1
    assert mask_iou(a, b) == pytest.approx(25 / 75)


def test_parse_sam_output_boxes_ids_and_frames():
    text = (
        "<0f>0<|box;x1=10;y1=20;x2=30;y2=40;w=100;h=80;c=0.91|><|mask;x=10;y=20;data=2,3,! abc|>,"
        "2<|box;x1=1;y1=2;x2=3;y2=4;w=100;h=80|>\n"
        "<3f>0<|box;x1=12;y1=22;x2=32;y2=42;w=100;h=80|>\n"
    )
    frames = parse_sam_output(text)
    assert [f.index for f in frames] == [0, 3]
    first = frames[0].objects
    assert [o.obj_id for o in first] == [0, 2]
    assert first[0].box == (10, 20, 30, 40)
    assert first[0].frame_size == (100, 80)
    assert first[0].confidence == pytest.approx(0.91)
    assert first[0].mask_header == {"x": "10", "y": "20"}
    assert first[0].mask_payload == "2,3,! abc"
    assert frames[1].objects[0].mask_payload is None


def test_parse_sam_output_empty_means_no_match():
    assert parse_sam_output("") == []


def test_real_sam_line_parses_box_and_payload_without_space():
    line = "<0f>0<|box;x1=841;y1=600;x2=923;y2=680;w=1800;h=1200;c=0.93|><|mask;x=0;y=0;c=0.93;data=81,83,!!!!!fD]hMrG|>"
    obj = parse_sam_output(line)[0].objects[0]
    assert obj.box == (841, 600, 923, 680)
    assert obj.mask_payload == "81,83,!!!!!fD]hMrG"
    from app.sam_format import split_mask_payload
    assert split_mask_payload(obj.mask_payload) == (81, 83, "!!!!!fD]hMrG")
    assert (923 - 841 + 1, 680 - 600 + 1) == (83, 81)  # raster covers the inclusive box


REAL_ONE_BIT_LINE = '<0f>0<|box;x1=841;y1=600;x2=923;y2=680;w=1800;h=1200;c=0.9336099624633789|><|mask;x=0;y=0;c=0.9336099624633789;data=81,83,!!!!!fD]hMrGjlC^Sa6RyNc`cRI90GAe$Q!iHeR8[6:m[Z5Y-]LsuLizR*Fa[*b8ofU_J&ln6*?wd]G)e+]V2|>'


def test_official_decoder_turns_real_sam_mask_into_round_ball_outline():
    obj = parse_sam_output(REAL_ONE_BIT_LINE)[0].objects[0]
    full = decode_mask(obj)
    assert full is not None, "meta-sam-parser must be installed"
    assert full.shape == (1200, 1800)
    x1, y1, x2, y2 = obj.box
    inside = full[y1:y2 + 1, x1:x2 + 1]
    assert 0.7 < inside.mean() < 0.85  # a ball fills about pi/4 of its box
    assert full.sum() == inside.sum()  # nothing outside the box
    polys = mask_to_polygons(full)
    assert len(polys) == 1 and len(polys[0]) >= 8  # a curved outline, not a rectangle
