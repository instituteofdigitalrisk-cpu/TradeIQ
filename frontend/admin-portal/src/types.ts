export type Role = "student" | "admin";

export type LoginUser = {
  user_id: string;
  full_name: string;
  email: string;
  university: string | null;
  year_of_study: number | null;
  role: Role;
  created_at: string;
};

export type LoginResponse = {
  message: string;
  user: LoginUser;
  token: string;
};

export type UserRow = {
  user_id: string;
  full_name: string;
  email: string;
  age: number | null;
  date_of_birth: string | null;
  phone_number: string | null;
  university: string | null;
  year_of_study: number | null;
  role: Role;
  is_paid: boolean;
  account_status?: string | null;
  competition_status?: string | null;
  mt5_account_id?: string | null;
  registration_status: string | null;
  created_at: string | null;
  total_capital: number;
  cash_balance: number;
  portfolio_value: number;
  return_pct: number;
  holdings_value: number;
  holdings_count: number;
  trade_count: number;
  latest_week_number: number | null;
  latest_final_score: number | null;
};

export type PaymentRecord = {
  payment_id: number;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  processed_at: string | null;
  created_at: string | null;
};

export type ActivityLog = {
  activity_id: number;
  user_id: string;
  event_type: string;
  description: string | null;
  metadata: string | null;
  created_at: string | null;
  actor?: string;
  action?: string;
  module?: string;
  target_name?: string;
  status?: string;
  details?: string;
};

// (UserDetail expanded later in the file with CRM fields)

export type UsersResponse = {
  total: number;
  page: number;
  per_page: number;
  users: UserRow[];
};

export type PortfolioSetup = {
  portfolio_id: number;
  user_id: string;
  total_capital: number;
  cash_balance: number;
  risk_appetite: string | null;
  investment_horizon: string | null;
  competition_round: string | null;
};

export type Holding = {
  holding_id: number;
  user_id: string;
  stock_ticker: string;
  stock_name: string | null;
  quantity: number;
  avg_buy_price: number;
  current_price: number;
  market_value: number;
  profit_loss: number;
  sector?: string | null;
  allocation_percent?: number;
  amount_invested?: number;
  thesis?: string | null;
};

export type Trade = {
  trade_id: string;
  user_id: string;
  trade_date: string | null;
  stock_ticker: string | null;
  stock_name: string | null;
  sector: string | null;
  allocation_percent: number;
  amount_invested: number;
  quantity: number | null;
  buy_price: number;
  current_sell_price: number;
  trade_type: "BUY" | "SELL";
  tag1: string | null;
  tag2: string | null;
  tag3: string | null;
  thesis: string | null;
  created_at: string;
};

export type WatchlistItem = {
  watchlist_id: number;
  user_id: string;
  stock_ticker: string;
  stock_name: string | null;
  sector: string | null;
  allocation_percent: number;
  amount_invested: number;
  quantity: number;
  buy_price: number;
  current_sell_price: number;
  trade_type: "BUY" | "SELL";
  tag1: string | null;
  tag2: string | null;
  tag3: string | null;
  thesis: string | null;
  created_at: string;
  updated_at: string;
};

export type WeeklyScore = {
  weekly_score_id?: number;
  user_id?: string;
  week_number: number;
  portfolio_score: number;
  risk_score: number;
  thesis_score: number;
  execution_score: number;
  strategy_score: number;
  final_score: number;
  rank_position: number | null;
  created_at?: string;
};

export type RiskMetrics = {
  risk_id?: number;
  user_id?: string;
  sharpe_ratio: number;
  beta: number;
  volatility: number;
  max_drawdown: number;
  var_value: number;
  updated_at?: string;
};

export type ThesisScore = {
  score_id?: number;
  thesis_id?: string;
  thesis_strength?: number;
  risk_assessment?: number;
  market_alignment?: number;
  final_score?: number;
};

export type Thesis = {
  thesis_id: string;
  trade_id: string;
  investment_style: string | null;
  risk_level: string | null;
  confidence_score: number | null;
  reason_text: string | null;
  created_at: string | null;
  scores: ThesisScore | null;
};

export type UserDetail = {
  profile: UserRow;
  portfolio: PortfolioSetup | null;
  holdings: Holding[];
  trades: Trade[];
  watchlist: WatchlistItem[];
  weekly_scores: WeeklyScore[];
  risk_metrics: RiskMetrics | null;
  theses: Thesis[];
  payments?: PaymentRecord[];
  activity_logs?: ActivityLog[];
  competition_enrollments?: CompetitionEnrollment[];
  crm_notes?: CRMNote[];
};

export type CompetitionEnrollment = {
  enrollment_id: number;
  user_id: string;
  competition_round: string | null;
  status: string;
  enrolled_at: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type CRMNote = {
  note_id: number;
  user_id: string;
  created_by: string | null;
  note_type: string | null;
  content: string | null;
  created_at: string | null;
};
export type StatsOverview = {
  totals: {
    total_users: number;
    users_this_week: number;
    users_this_month: number;
    admin_users: number;
    student_users: number;
    total_trades: number;
    buy_volume: number;
    sell_volume: number;
    active_holdings: number;
    portfolios: number;
    paid_students?: number;
    suspended_accounts?: number;
    active_students?: number;
    total_payments?: number;
    payments_amount?: number;
    payments_completed?: number;
    payments_pending?: number;
    total_enrollments?: number;
  };
  averages: {
    avg_portfolio_value: number;
    avg_return_pct: number;
  };
  registrations_by_day: { date: string; count: number }[];
  university_breakdown: { university: string | null; count: number }[];
  top_performers: {
    user_id: string;
    full_name: string;
    email: string;
    university: string | null;
    week_number: number;
    final_score: number;
    portfolio_score: number;
    risk_score: number;
    thesis_score: number;
    execution_score: number;
    strategy_score: number;
  }[];
  enrollment_breakdown?: { competition_round: string; count: number }[];
};

export type ApiError = { error?: string; msg?: string; details?: string };

export type CompetitionRound = {
  competition_id: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  active: boolean;
  created_at?: string | null;
};

export type CompetitionRoundsResponse = {
  total: number;
  page: number;
  per_page: number;
  rounds: CompetitionRound[];
};

export type Report = {
  report_id: number;
  user_id: string | null;
  week_number: number | null;
  report_path: string;
  generated_at: string | null;
};

export type ReportsResponse = {
  total: number;
  page: number;
  per_page: number;
  reports: Report[];
};

export type Setting = {
  key: string;
  value: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SettingsResponse = {
  total: number;
  page: number;
  per_page: number;
  settings: Setting[];
};
