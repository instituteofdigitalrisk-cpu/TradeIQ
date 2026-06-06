CREATE DATABASE IF NOT EXISTS tradeiq;
USE tradeiq;


CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(20) PRIMARY KEY,

    full_name VARCHAR(100) NOT NULL,

    age INT,

    date_of_birth DATE,

    email VARCHAR(150) UNIQUE NOT NULL,

    phone_number VARCHAR(20),

    university VARCHAR(150),

    course VARCHAR(100),

    year_of_study INT,

    participation_type VARCHAR(20),

    team_name VARCHAR(100),

    role VARCHAR(20) DEFAULT 'student',

    password_hash VARCHAR(64) NOT NULL DEFAULT '',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS portfolio_setup (

    portfolio_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id VARCHAR(20) NOT NULL,

    total_capital DECIMAL(15,2) DEFAULT 10000.00,

    cash_balance DECIMAL(15,2) DEFAULT 10000.00,

    risk_appetite VARCHAR(20),

    investment_horizon VARCHAR(50),

    competition_round VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_portfolio_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS trade_log (

    trade_id VARCHAR(20) PRIMARY KEY,

    user_id VARCHAR(20) NOT NULL,

    trade_date DATE,

    stock_ticker VARCHAR(20),

    stock_name VARCHAR(100),

    sector VARCHAR(100),

    allocation_percent DECIMAL(5,2),

    amount_invested DECIMAL(15,2),

    quantity INT,

    buy_price DECIMAL(15,2),

    current_sell_price DECIMAL(15,2),

    trade_type ENUM('BUY','SELL'),

    tag1 VARCHAR(100),

    tag2 VARCHAR(100),

    tag3 VARCHAR(100),

    thesis TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_trade_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS holdings (

    holding_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id VARCHAR(20) NOT NULL,

    stock_ticker VARCHAR(20),

    stock_name VARCHAR(100),

    quantity INT,

    avg_buy_price DECIMAL(15,2),

    current_price DECIMAL(15,2),

    market_value DECIMAL(15,2),

    profit_loss DECIMAL(15,2),

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_holdings_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS investment_thesis (

    thesis_id INT AUTO_INCREMENT PRIMARY KEY,

    trade_id VARCHAR(20),

    user_id VARCHAR(20),

    investment_style VARCHAR(50),

    risk_level VARCHAR(20),

    confidence_score INT,

    reason_text TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_thesis_trade
        FOREIGN KEY (trade_id)
        REFERENCES trade_log(trade_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_thesis_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS thesis_scores (

    score_id INT AUTO_INCREMENT PRIMARY KEY,

    thesis_id INT,

    clarity_score DECIMAL(5,2),

    reasoning_score DECIMAL(5,2),

    risk_awareness_score DECIMAL(5,2),

    market_understanding_score DECIMAL(5,2),

    total_score DECIMAL(5,2),

    feedback TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_score_thesis
        FOREIGN KEY (thesis_id)
        REFERENCES investment_thesis(thesis_id)
        ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS risk_metrics (

    risk_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id VARCHAR(20),

    sharpe_ratio DECIMAL(10,4),

    beta DECIMAL(10,4),

    volatility DECIMAL(10,4),

    max_drawdown DECIMAL(10,4),

    var_value DECIMAL(10,4),

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_risk_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS weekly_scores (

    score_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id VARCHAR(20) NOT NULL,

    week_number INT NOT NULL,

    -- Portfolio (50)
    portfolio_score DECIMAL(5,2),

    -- Risk (20)
    risk_score DECIMAL(5,2),

    -- Thesis (5)
    thesis_score DECIMAL(5,2),

    -- Execution (10)
    execution_score DECIMAL(5,2),

    -- Strategy (15)
    strategy_score DECIMAL(5,2),

    -- Total (100)
    final_score DECIMAL(5,2),

    rank_position INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);



CREATE TABLE IF NOT EXISTS leaderboard (

    leaderboard_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id VARCHAR(20) NOT NULL,

    week_number INT,

    portfolio_score DECIMAL(5,2),

    risk_score DECIMAL(5,2),

    thesis_score DECIMAL(5,2),

    execution_score DECIMAL(5,2),

    strategy_score DECIMAL(5,2),

    final_score DECIMAL(5,2),

    rank_position INT,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS reports (

    report_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id VARCHAR(20),

    week_number INT,

    report_path VARCHAR(255),

    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

