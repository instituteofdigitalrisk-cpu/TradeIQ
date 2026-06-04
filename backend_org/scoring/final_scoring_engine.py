import pandas as pd

from risk_engine      import sharpe_score, drawdown_score, beta_score, risk_score
from strategy_engine  import diversification_score, consistency_score, prediction_score, strategy_score
from execution_engine import classification_score, documentation_score, execution_score
from thesis_engine    import ai_thesis_score


# =====================================
# SCORING ENGINE
# =====================================

class TradeIQScoringEngine:

    # =====================================
    # ROI SCORE (50)
    # =====================================

    @staticmethod
    def roi_score(
        total_return_score,
        benchmark_score,
        net_profit_score
    ):

        return (
            total_return_score
            + benchmark_score
            + net_profit_score
        )

    # =====================================
    # RISK SCORE (20)
    # =====================================

    @staticmethod
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

    # =====================================
    # STRATEGY SCORE (15)
    # =====================================

    @staticmethod
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

    # =====================================
    # EXECUTION SCORE (10)
    # =====================================

    @staticmethod
    def execution_score(
        classification_score,
        documentation_score
    ):

        return (
            classification_score
            + documentation_score
        )

    # =====================================
    # AI THESIS SCORE (5)
    # =====================================

    @staticmethod
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

    # =====================================
    # FINAL SCORE (100)
    # =====================================

    @staticmethod
    def final_score(
        roi,
        risk,
        strategy,
        execution,
        thesis
    ):

        return round(

            roi

            + risk

            + strategy

            + execution

            + thesis,

            2

        )


# =====================================
# RANKING STUDENTS
# =====================================

def rank_students(df):

    df["Rank"] = (
        df["Final Score"]
        .rank(
            ascending=False,
            method="dense"
        )
        .astype(int)
    )

    return df


# =====================================
# EXAMPLE
# =====================================

if __name__ == "__main__":

    # --- compute sub-scores ---

    sh  = sharpe_score(1.4)
    dd  = drawdown_score(8.0)
    bt  = beta_score(1.05)

    dv  = diversification_score(5, 28.0)
    cs  = consistency_score(4)
    pr  = prediction_score(8, 10)

    cl_ = classification_score(9, 10)
    dc  = documentation_score(10, 10)

    th  = ai_thesis_score(1.25, 1.0, 1.0, 1.25)

    # --- section totals ---

    roi      = 42.5
    risk     = TradeIQScoringEngine.risk_score(sh, dd, bt)
    strategy = TradeIQScoringEngine.strategy_score(dv, cs, pr)
    execution= TradeIQScoringEngine.execution_score(cl_, dc)
    thesis   = th

    final = TradeIQScoringEngine.final_score(
        roi,
        risk,
        strategy,
        execution,
        thesis
    )

    print(final)

    # --- leaderboard ---

    data = {
        "Name": ["Arjun Sharma", "Priya Mehta", "Rahul Iyer"],
        "Final Score": [
            TradeIQScoringEngine.final_score(42.5, risk_score(sharpe_score(1.4),  drawdown_score(8.0),  beta_score(1.05)), strategy_score(diversification_score(5, 28.0),  consistency_score(4), prediction_score(8, 10)),  execution_score(classification_score(9,  10), documentation_score(10, 10)), ai_thesis_score(1.25, 1.0,  1.0,  1.25)),
            TradeIQScoringEngine.final_score(30.0, risk_score(sharpe_score(0.9),  drawdown_score(14.0), beta_score(1.3)),  strategy_score(diversification_score(3, 40.0),  consistency_score(3), prediction_score(6, 10)),  execution_score(classification_score(6,  10), documentation_score(7,  10)), ai_thesis_score(0.75, 1.0,  0.5,  0.75)),
            TradeIQScoringEngine.final_score(50.0, risk_score(sharpe_score(1.8),  drawdown_score(5.0),  beta_score(0.95)), strategy_score(diversification_score(6, 22.0),  consistency_score(4), prediction_score(9, 10)),  execution_score(classification_score(10, 10), documentation_score(10, 10)), ai_thesis_score(1.25, 1.25, 1.25, 1.0)),
        ]
    }

    df = pd.DataFrame(data)
    df = rank_students(df)

    print()
    print(df.to_string(index=False))
