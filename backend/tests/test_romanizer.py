from app.japanese.romanizer import JapaneseRomanizer


def test_hepburn_romanization() -> None:
    romanizer = JapaneseRomanizer()
    result = romanizer.romanize("ここにいる間は")
    assert "koko" in result
    assert "iru" in result
