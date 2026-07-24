export const C = {
  bg0: "#050812",
  bg1: "#0a1020",
  bg2: "#10182b",
  bg3: "#17223a",
  bg4: "#1f2d49",
  border: "rgba(255,255,255,0.10)",
  border2: "rgba(255,255,255,0.18)",
  text0: "#f7f9ff",
  text1: "#c7d0ea",
  text2: "#8390b1",
  cyan: "#31e6ff",
  purple: "#8d7cff",
  green: "#1ee6a3",
  gold: "#ffd166",
  red: "#ff5f7e",
  silver: "#dce6f4",
  platinum: "#f8fbff",
  ink: "#070b14",
} as const;

export const font = {
  heading: "Neuton_700Bold",
  headingHeavy: "Neuton_800ExtraBold",
  regular: "Lora_400Regular",
  medium: "Lora_600SemiBold",
  mono: process.env.EXPO_OS === "ios" ? "Menlo" : "monospace",
};

export const heroVideo = require("../imports/Multi-Shot_Video_-_premium_learning_competition_for_students_to_understand_investing__portfolio_cons.mp4");
export const brandLogo = require("../imports/brand-logo.jpeg");
export const brandIcon = require("../imports/brand-icon.png");
export const tradeIqLogo = require("../imports/TradeIQ.png");
export const prizePoolImage = require("../imports/prize-pool.png");
export const cashPrizeImage = require("../imports/cash-prize.png");

export const backgrounds = ["None", "Basic", "Intermediate", "Advanced"];

export const assetOptions = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "JPM",
  "V",
  "UNH",
  "SPY",
  "QQQ",
  "DIA",
];

export const sectorOptions = ["Technology", "Communication Services", "Consumer Cyclical", "Financial Services", "Healthcare", "Energy", "Industrials", "Broad Market", "Foreign Stock"];

export const glossary: Record<string, { term: string; def: string; formula?: string; example: string; why: string; related: string }> = {
  sharpe: {
    term: "Sharpe Ratio",
    def: "Measures risk-adjusted return: how much excess return you earn per unit of risk taken.",
    formula: "Sharpe = (Portfolio Return - Risk-free Rate) / Standard Deviation",
    example: "Portfolio earned 12%, risk-free rate 6.5%, std dev 8%, so Sharpe is 0.69. Above 1 is generally good.",
    why: "Compares strategies with different risk levels. A 15% return with high volatility may be worse than 10% with low volatility.",
    related: "Alpha | Beta | Drawdown",
  },
  pe: {
    term: "P/E Ratio",
    def: "Price-to-earnings ratio. Shows how much investors pay per unit of earnings.",
    formula: "P/E = Market Price per Share / Earnings per Share",
    example: "A NIFTY 50 trailing P/E near 22 means investors pay about Rs. 22 for Rs. 1 of earnings.",
    why: "Core valuation tool that helps identify if a stock is cheap or expensive versus peers or its own history.",
    related: "P/B Ratio | EPS | Market Cap",
  },
  beta: {
    term: "Beta",
    def: "Measures how much a stock moves relative to the market. Beta above 1 means more volatile than market.",
    formula: "Beta = Covariance(Stock, Market) / Variance(Market)",
    example: "HDFC Bank beta near 0.85 means if NIFTY falls 10%, HDFC may fall about 8.5%.",
    why: "Essential for portfolio construction because high-beta stocks amplify both gains and losses.",
    related: "Alpha | Volatility | Correlation",
  },
  alpha: {
    term: "Alpha",
    def: "Excess return generated above the benchmark after adjusting for risk.",
    formula: "Alpha = Portfolio Return - [Risk-free Rate + Beta x (Market Return - Risk-free Rate)]",
    example: "Benchmark returned 10% and your portfolio returned 13% with similar risk, so alpha is about 3%.",
    why: "The ultimate measure of skill versus luck. Consistent positive alpha is rare and highly valued.",
    related: "Sharpe Ratio | Beta | Benchmark",
  },
  drawdown: {
    term: "Drawdown",
    def: "The peak-to-trough decline in portfolio value over a period.",
    formula: "Drawdown = (Trough Value - Peak Value) / Peak Value x 100",
    example: "Portfolio peaked at Rs. 12,000 then fell to Rs. 9,600, so drawdown is -20%.",
    why: "Crucial risk metric. Managing drawdown prevents panic-selling at the bottom.",
    related: "Volatility | Risk Management | Rebalancing",
  },
  diversification: {
    term: "Diversification",
    def: "Spreading investments across assets, sectors, or geographies to reduce unsystematic risk.",
    formula: "Portfolio variance depends on weights, volatility, and correlation across holdings.",
    example: "Holding IT ETF, Pharma ETF, and Govt Bond ETF means a tech downturn will not wipe your portfolio.",
    why: "Reduces volatility without proportionally reducing returns when assets are not perfectly correlated.",
    related: "Correlation | Beta | Sector Rotation",
  },
  nav: {
    term: "NAV",
    def: "Net asset value is the total value of a fund or portfolio after subtracting liabilities.",
    formula: "NAV = (Assets - Liabilities) / Units Outstanding",
    example: "If a fund owns Rs. 10 crore of assets and has 10 lakh units, NAV is Rs. 100 per unit.",
    why: "NAV helps track portfolio value over time and compare performance before and after cash flows.",
    related: "Portfolio Value | Benchmark | Return",
  },
  duration: {
    term: "Duration",
    def: "Measures a bond portfolio's sensitivity to interest-rate changes.",
    formula: "Approx price change = -Duration x Change in yield",
    example: "A bond with duration 5 may fall about 5% if yields rise by 1 percentage point.",
    why: "Duration is central for fixed-income risk because higher duration means higher rate sensitivity.",
    related: "Yield | Interest Rate Risk | Bonds",
  },
  yield: {
    term: "Yield",
    def: "The income return earned from an investment, usually shown as a percentage of price.",
    formula: "Dividend Yield = Annual Dividend / Current Price",
    example: "A stock paying Rs. 5 annual dividend at Rs. 100 price has a 5% dividend yield.",
    why: "Yield helps compare income opportunities, but high yield can also signal higher risk.",
    related: "Coupon | Dividend | Total Return",
  },
  volatility: {
    term: "Volatility",
    def: "Measures how much returns move around their average. Higher volatility means wider price swings.",
    formula: "Volatility is commonly measured as standard deviation of returns.",
    example: "A portfolio moving +/- 3% daily is more volatile than one moving +/- 0.8% daily.",
    why: "Volatility affects drawdowns, position sizing, and whether a return is worth the risk taken.",
    related: "Sharpe Ratio | Drawdown | Risk",
  },
  correlation: {
    term: "Correlation",
    def: "Measures how closely two assets move together, from -1 to +1.",
    formula: "Correlation = Covariance(Asset A, Asset B) / (Std A x Std B)",
    example: "If tech stocks often rise and fall together, their correlation is high.",
    why: "Low or negative correlation can reduce portfolio risk through diversification.",
    related: "Diversification | Beta | Portfolio Variance",
  },
  benchmark: {
    term: "Benchmark",
    def: "A reference index or portfolio used to judge performance, such as NIFTY 50, S&P 500, SPY, or QQQ.",
    formula: "Excess Return = Portfolio Return - Benchmark Return",
    example: "If your portfolio returns 12% and the benchmark returns 8%, excess return is 4%.",
    why: "Benchmarks show whether returns came from skill, market movement, or taking a different type of risk.",
    related: "Alpha | Tracking Error | Relative Return",
  },
};

export const glossaryTerms = [
  { key: "sharpe", label: "Sharpe Ratio", color: C.cyan },
  { key: "pe", label: "P/E Ratio", color: C.purple },
  { key: "beta", label: "Beta", color: C.green },
  { key: "alpha", label: "Alpha", color: C.gold },
  { key: "drawdown", label: "Drawdown", color: C.red },
  { key: "diversification", label: "Diversification", color: C.cyan },
  { key: "nav", label: "NAV", color: C.purple },
  { key: "duration", label: "Duration", color: C.green },
  { key: "yield", label: "Yield", color: C.gold },
  { key: "volatility", label: "Volatility", color: C.red },
  { key: "correlation", label: "Correlation", color: C.cyan },
  { key: "benchmark", label: "Benchmark", color: C.purple },
] as const;
