from backend.category_map import normalize_category


def test_basic_codes():
    assert normalize_category("UR") == "UR"
    assert normalize_category("Open") == "UR"
    assert normalize_category("GEN") == "UR"
    assert normalize_category("OBC") == "OBC"
    assert normalize_category("OBC-NCL") == "OBC"
    assert normalize_category("SC") == "SC"
    assert normalize_category("ST") == "ST"
    assert normalize_category("EWS") == "EWS"


def test_pwd_variants():
    assert normalize_category("PwD-UR") == "PwD_UR"
    assert normalize_category("PH-OBC") == "PwD_OBC"
    assert normalize_category("PWD/SC") == "PwD_SC"


def test_empty_and_unknown():
    assert normalize_category("") == ""
    # unknown stays uppercase so the parser can reject + log it
    assert normalize_category("XYZ") == "XYZ"
