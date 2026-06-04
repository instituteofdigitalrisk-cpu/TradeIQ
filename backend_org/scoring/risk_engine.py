# =====================================
# RISK SCORE (20)
# =====================================

def risk_score(
    sharpe_score,
    drawdown_score,
    beta_score
):

    return (
        sharpe_score
        + drawdown_score
        + beta_score
    )


# Sharpe Score (/7)

def sharpe_score(sharpe):

    score = min(
        7,
        max(
            0,
            ((sharpe + 1) / 3) * 7
        )
    )

    return round(score, 2)


# Drawdown Score (/7)

def drawdown_score(drawdown_percent):

    score = max(
        0,
        7 - ((drawdown_percent / 20) * 7)
    )

    return round(score, 2)


# Beta Score (/6)

def beta_score(beta):

    mismatch = abs(beta - 1)

    score = max(
        0,
        6 - (mismatch * 2)
    )

    return round(score, 2)
