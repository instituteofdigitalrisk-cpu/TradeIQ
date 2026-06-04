# =====================================
# EXECUTION SCORE (10)
# =====================================

def execution_score(
    classification_score,
    documentation_score
):

    return (
        classification_score
        + documentation_score
    )


# Classification Score (/5)

def classification_score(
    unique_tags,
    total_trades
):

    if total_trades == 0:
        return 0

    return round(

        min(
            5,
            (unique_tags / total_trades)
            * 5
        ),

        2

    )


# Documentation Score (/5)

def documentation_score(
    trades_with_thesis,
    total_trades
):

    if total_trades == 0:
        return 0

    return round(

        min(
            5,
            (trades_with_thesis / total_trades)
            * 5
        ),

        2

    )
