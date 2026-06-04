# =====================================
# ROI SCORE (50)
# =====================================

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
