from datetime import datetime
from app.extensions import db


# ─────────────────────────────────────────
# users
# ─────────────────────────────────────────

class User(db.Model):
    __tablename__ = "users"

    user_id            = db.Column(db.String(20),  primary_key=True)
    full_name          = db.Column(db.String(100),  nullable=False)
    age                = db.Column(db.Integer)
    date_of_birth      = db.Column(db.Date)
    email              = db.Column(db.String(150),  unique=True, nullable=False)
    phone_number       = db.Column(db.String(20))
    university         = db.Column(db.String(150))
    year_of_study      = db.Column(db.Integer)
    role               = db.Column(db.String(20),  default="student")
    password_hash      = db.Column(db.String(255),  nullable=False)
    created_at         = db.Column(db.DateTime,    default=datetime.utcnow)

    # relationships
    portfolio   = db.relationship("PortfolioSetup",  backref="user", uselist=False)
    trades      = db.relationship("TradeLog",        backref="user")
    holdings    = db.relationship("Holding",         backref="user")
    watchlist   = db.relationship("Watchlist",       backref="user")
    risk        = db.relationship("RiskMetrics",     backref="user", uselist=False)
    scores      = db.relationship("WeeklyScore",     backref="user")
    leaderboard = db.relationship("Leaderboard",     backref="user")

    def to_dict(self):
        return {
            "user_id":            self.user_id,
            "full_name":          self.full_name,
            "email":              self.email,
            "university":         self.university,
            "year_of_study":      self.year_of_study,
            "role":               self.role,
            "created_at":         str(self.created_at),
        }


# ─────────────────────────────────────────
# portfolio_setup
# ─────────────────────────────────────────

class PortfolioSetup(db.Model):
    __tablename__ = "portfolio_setup"

    portfolio_id       = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    user_id            = db.Column(db.String(20),  db.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    total_capital      = db.Column(db.Numeric(15, 2), default=10000.00)
    cash_balance       = db.Column(db.Numeric(15, 2), default=10000.00)
    risk_appetite      = db.Column(db.String(20))
    investment_horizon = db.Column(db.String(50))
    competition_round  = db.Column(db.String(50))
    created_at         = db.Column(db.DateTime,   default=datetime.utcnow)

    def to_dict(self):
        return {
            "portfolio_id":       self.portfolio_id,
            "user_id":            self.user_id,
            "total_capital":      float(self.total_capital),
            "cash_balance":       float(self.cash_balance),
            "risk_appetite":      self.risk_appetite,
            "investment_horizon": self.investment_horizon,
            "competition_round":  self.competition_round,
        }


# ─────────────────────────────────────────
# trade_log
# ─────────────────────────────────────────

class TradeLog(db.Model):
    __tablename__ = "trade_log"

    trade_id           = db.Column(db.String(20),  primary_key=True)
    user_id            = db.Column(db.String(20),  db.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    trade_date         = db.Column(db.Date)
    stock_ticker       = db.Column(db.String(20))
    stock_name         = db.Column(db.String(100))
    sector             = db.Column(db.String(100))
    allocation_percent = db.Column(db.Numeric(5, 2))
    amount_invested    = db.Column(db.Numeric(15, 2))
    quantity           = db.Column(db.Integer)
    buy_price          = db.Column(db.Numeric(15, 2))
    current_sell_price = db.Column(db.Numeric(15, 2))
    trade_type         = db.Column(db.Enum("BUY", "SELL"))
    tag1               = db.Column(db.String(100))
    tag2               = db.Column(db.String(100))
    tag3               = db.Column(db.String(100))
    thesis             = db.Column(db.Text)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "trade_id":           self.trade_id,
            "user_id":            self.user_id,
            "trade_date":         str(self.trade_date),
            "stock_ticker":       self.stock_ticker,
            "stock_name":         self.stock_name,
            "sector":             self.sector,
            "allocation_percent": float(self.allocation_percent or 0),
            "amount_invested":    float(self.amount_invested or 0),
            "quantity":           self.quantity,
            "buy_price":          float(self.buy_price or 0),
            "current_sell_price": float(self.current_sell_price or 0),
            "trade_type":         self.trade_type,
            "tag1":               self.tag1,
            "tag2":               self.tag2,
            "tag3":               self.tag3,
            "thesis":             self.thesis,
        }


# ─────────────────────────────────────────
# holdings
# ─────────────────────────────────────────

class Holding(db.Model):
    __tablename__ = "holdings"

    holding_id    = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    user_id       = db.Column(db.String(20),  db.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    stock_ticker  = db.Column(db.String(20))
    stock_name    = db.Column(db.String(100))
    quantity      = db.Column(db.Integer)
    avg_buy_price = db.Column(db.Numeric(15, 2))
    current_price = db.Column(db.Numeric(15, 2))
    market_value  = db.Column(db.Numeric(15, 2))
    profit_loss   = db.Column(db.Numeric(15, 2))
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "holding_id":    self.holding_id,
            "stock_ticker":  self.stock_ticker,
            "stock_name":    self.stock_name,
            "quantity":      self.quantity,
            "avg_buy_price": float(self.avg_buy_price or 0),
            "current_price": float(self.current_price or 0),
            "market_value":  float(self.market_value or 0),
            "profit_loss":   float(self.profit_loss or 0),
        }


# ─────────────────────────────────────────
# watchlist
#
# Stocks the user is tracking but has NOT committed capital to yet. Kept
# entirely separate from trade_log / holdings on purpose: scoring, the
# allocation summary, and "active holdings" all read only from those two
# tables, so a watchlist entry never affects a score or an allocation % —
# only a real trade (via POST /portfolio/trade) does that.
# ─────────────────────────────────────────

class Watchlist(db.Model):
    __tablename__ = "watchlist"

    watchlist_id       = db.Column(db.Integer,     primary_key=True, autoincrement=True)
    user_id             = db.Column(db.String(20),  db.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    stock_ticker        = db.Column(db.String(20),  nullable=False)
    stock_name          = db.Column(db.String(100))
    sector               = db.Column(db.String(100))
    allocation_percent  = db.Column(db.Numeric(5, 2))
    amount_invested      = db.Column(db.Numeric(15, 2))
    quantity             = db.Column(db.Integer)
    buy_price            = db.Column(db.Numeric(15, 2))
    current_sell_price  = db.Column(db.Numeric(15, 2))
    trade_type           = db.Column(db.Enum("BUY", "SELL"), default="BUY")
    tag1                 = db.Column(db.String(100))
    tag2                 = db.Column(db.String(100))
    tag3                 = db.Column(db.String(100))
    thesis                = db.Column(db.Text)
    created_at           = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at           = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "watchlist_id":       self.watchlist_id,
            "user_id":            self.user_id,
            "stock_ticker":       self.stock_ticker,
            "stock_name":         self.stock_name,
            "sector":             self.sector,
            "allocation_percent": float(self.allocation_percent or 0),
            "amount_invested":    float(self.amount_invested or 0),
            "quantity":           self.quantity,
            "buy_price":          float(self.buy_price or 0),
            "current_sell_price": float(self.current_sell_price or 0),
            "trade_type":         self.trade_type,
            "tag1":               self.tag1,
            "tag2":               self.tag2,
            "tag3":               self.tag3,
            "thesis":             self.thesis,
            "created_at":         str(self.created_at),
            "updated_at":         str(self.updated_at),
        }


# ─────────────────────────────────────────
# investment_thesis
# ─────────────────────────────────────────

class InvestmentThesis(db.Model):
    __tablename__ = "investment_thesis"

    thesis_id        = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    trade_id         = db.Column(db.String(20), db.ForeignKey("trade_log.trade_id",  ondelete="CASCADE"))
    user_id          = db.Column(db.String(20), db.ForeignKey("users.user_id",       ondelete="CASCADE"))
    investment_style = db.Column(db.String(50))
    risk_level       = db.Column(db.String(20))
    confidence_score = db.Column(db.Integer)
    reason_text      = db.Column(db.Text)
    created_at       = db.Column(db.DateTime,  default=datetime.utcnow)

    scores = db.relationship("ThesisScore", backref="thesis", uselist=False)


# ─────────────────────────────────────────
# thesis_scores
# ─────────────────────────────────────────

class ThesisScore(db.Model):
    __tablename__ = "thesis_scores"

    score_id                   = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    thesis_id                  = db.Column(db.Integer,    db.ForeignKey("investment_thesis.thesis_id", ondelete="CASCADE"))
    clarity_score              = db.Column(db.Numeric(5, 2))
    reasoning_score            = db.Column(db.Numeric(5, 2))
    risk_awareness_score       = db.Column(db.Numeric(5, 2))
    market_understanding_score = db.Column(db.Numeric(5, 2))
    total_score                = db.Column(db.Numeric(5, 2))
    feedback                   = db.Column(db.Text)
    created_at                 = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "clarity":              float(self.clarity_score or 0),
            "reasoning":            float(self.reasoning_score or 0),
            "risk_awareness":       float(self.risk_awareness_score or 0),
            "market_understanding": float(self.market_understanding_score or 0),
            "total":                float(self.total_score or 0),
            "feedback":             self.feedback,
        }


# ─────────────────────────────────────────
# risk_metrics
# ─────────────────────────────────────────

class RiskMetrics(db.Model):
    __tablename__ = "risk_metrics"

    risk_id      = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    user_id      = db.Column(db.String(20), db.ForeignKey("users.user_id", ondelete="CASCADE"))
    sharpe_ratio = db.Column(db.Numeric(10, 4))
    beta         = db.Column(db.Numeric(10, 4))
    volatility   = db.Column(db.Numeric(10, 4))
    max_drawdown = db.Column(db.Numeric(10, 4))
    var_value    = db.Column(db.Numeric(10, 4))
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "sharpe_ratio": float(self.sharpe_ratio or 0),
            "beta":         float(self.beta or 0),
            "volatility":   float(self.volatility or 0),
            "max_drawdown": float(self.max_drawdown or 0),
            "var_value":    float(self.var_value or 0),
        }


# ─────────────────────────────────────────
# weekly_scores
# ─────────────────────────────────────────

class WeeklyScore(db.Model):
    __tablename__ = "weekly_scores"

    score_id       = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    user_id        = db.Column(db.String(20), db.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    week_number    = db.Column(db.Integer,    nullable=False)
    portfolio_score= db.Column(db.Numeric(5, 2))
    risk_score     = db.Column(db.Numeric(5, 2))
    thesis_score   = db.Column(db.Numeric(5, 2))
    execution_score= db.Column(db.Numeric(5, 2))
    strategy_score = db.Column(db.Numeric(5, 2))
    final_score    = db.Column(db.Numeric(5, 2))
    rank_position  = db.Column(db.Integer)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "week_number":    self.week_number,
            "portfolio_score":float(self.portfolio_score or 0),
            "risk_score":     float(self.risk_score or 0),
            "thesis_score":   float(self.thesis_score or 0),
            "execution_score":float(self.execution_score or 0),
            "strategy_score": float(self.strategy_score or 0),
            "final_score":    float(self.final_score or 0),
            "rank_position":  self.rank_position,
        }


# ─────────────────────────────────────────
# leaderboard
# ─────────────────────────────────────────

class Leaderboard(db.Model):
    __tablename__ = "leaderboard"

    leaderboard_id  = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    user_id         = db.Column(db.String(20), db.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    week_number     = db.Column(db.Integer)
    portfolio_score = db.Column(db.Numeric(5, 2))
    risk_score      = db.Column(db.Numeric(5, 2))
    thesis_score    = db.Column(db.Numeric(5, 2))
    execution_score = db.Column(db.Numeric(5, 2))
    strategy_score  = db.Column(db.Numeric(5, 2))
    final_score     = db.Column(db.Numeric(5, 2))
    rank_position   = db.Column(db.Integer)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "user_id":        self.user_id,
            "full_name":      self.user.full_name if self.user else None,
            "university":     self.user.university if self.user else None,
            "week_number":    self.week_number,
            "portfolio_score":float(self.portfolio_score or 0),
            "risk_score":     float(self.risk_score or 0),
            "thesis_score":   float(self.thesis_score or 0),
            "execution_score":float(self.execution_score or 0),
            "strategy_score": float(self.strategy_score or 0),
            "final_score":    float(self.final_score or 0),
            "rank_position":  self.rank_position,
        }


# ─────────────────────────────────────────
# reports
# ─────────────────────────────────────────

class Report(db.Model):
    __tablename__ = "reports"

    report_id    = db.Column(db.Integer,    primary_key=True, autoincrement=True)
    user_id      = db.Column(db.String(20), db.ForeignKey("users.user_id", ondelete="CASCADE"))
    week_number  = db.Column(db.Integer)
    report_path  = db.Column(db.String(255))
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)
