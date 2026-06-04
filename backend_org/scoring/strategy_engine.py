# =====================================
# STRATEGY SCORE (15)
# =====================================

def strategy_score(
    diversification_score,
    consistency_score,
    prediction_score
):

    return (
        diversification_score
        + consistency_score
        + prediction_score
    )


# Diversification (/6)

def diversification_score(
    sectors,
    max_allocation
):

    score = min(
        6,
        (sectors / 5) * 6
    )

    penalty = max(
        0,
        (max_allocation - 30) / 100
    )

    score *= (1 - penalty)

    return round(score, 2)


# Consistency (/5)

def consistency_score(
    weeks_active
):

    return round(
        min(5, (weeks_active / 4) * 5),
        2
    )


# Prediction Score (/4)

def prediction_score(
    correct_direction,
    total_trades
):

    if total_trades == 0:
        return 0

    return round(

        (correct_direction / total_trades)

        * 4,

        2

    )
