from app.alignment.aligner import score_alignment


def test_perfect_alignment_scores_highly() -> None:
    score = score_alignment(10, 12, 10, 12, 1)
    assert score.value == 1


def test_distant_segment_scores_low() -> None:
    assert score_alignment(10, 12, 30, 32, 1).value == 0.15
