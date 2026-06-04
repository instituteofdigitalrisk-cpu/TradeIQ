# =====================================
# AI THESIS SCORE (5)
# =====================================

def thesis_score(
    clarity,
    financial_logic,
    risk_awareness,
    market_understanding
):

    return (
        clarity
        + financial_logic
        + risk_awareness
        + market_understanding
    )


# AI Thesis Score (/5)
# Each metric: 0 to 1.25
# Maximum: 5

def ai_thesis_score(
    clarity,
    financial_logic,
    risk_awareness,
    market_understanding
):

    return round(

        clarity

        + financial_logic

        + risk_awareness

        + market_understanding,

        2

    )
