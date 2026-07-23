import { Trash2, TrendingDown, TrendingUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, Alert } from "react-native";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import { analytics, market, portfolio } from "../api";
import type { BackendHolding, BackendTrade, BackendWeeklyScore, MarketIndex, PortfolioSummary } from "../api";
import { Legend, LineChart } from "../components/charts";
import { GlassCard, Progress, SectionTitle } from "../components/ui";
import { getMarketIndices } from "../market-store";

const CHART_POINTS = 7;
const INDIAN_TICKERS = ["^NSEI", "^BSESN", "^CNXIT", "^CNXPHARMA"];
const TRENDING_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA"];

type DashboardTab = "portfolio" | "overview" | "allocation" | "market";
type ActiveHolding = {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  buyPrice: number;
  currentPrice: number;
  investment: number;
  quantity: number;
  allocationPercent: number;
  pnl: number;
};

function sampleAndNormalize(records: { Close: number }[], points: number): number[] {
  if (records.length === 0) return [];
  const step = Math.max(1, Math.floor((records.length - 1) / (points - 1)));
  const sampled: number[] = [];
  for (let i = 0; i < points - 1; i++) {
    sampled.push(records[Math.min(i * step, records.length - 1)].Close);
  }
  sampled.push(records[records.length - 1].Close);
  const base = sampled[0];
  return sampled.map((c) => Math.round((c / base) * 10000));
}

function portfolioLine(startCapital: number, currentValue: number, points: number): number[] {
  const step = (currentValue - startCapital) / (points - 1);
  return Array.from({ length: points }, (_, i) => Math.round(startCapital + step * i));
}

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function holdingToActiveHolding(holding: BackendHolding, totalCapital: number): ActiveHolding {
  const quantity = Number(holding.quantity || 0);
  const buyPrice = Number(holding.avg_buy_price || 0);
  const currentPrice = Number(holding.current_price || buyPrice || 0);
  const investment = buyPrice * quantity;
  return {
    id: `holding-${holding.holding_id}`,
    ticker: holding.stock_ticker,
    name: holding.stock_name || holding.stock_ticker,
    sector: holding.sector || "Unclassified",
    buyPrice,
    currentPrice,
    investment,
    quantity,
    allocationPercent: Number(holding.allocation_percent || 0) || (totalCapital > 0 ? (investment / totalCapital) * 100 : 0),
    pnl: Number(holding.profit_loss || 0),
  };
}

function tradeToActiveHolding(trade: BackendTrade, totalCapital: number): ActiveHolding {
  const quantity = Number(trade.quantity || 0);
  const buyPrice = Number(trade.buy_price || 0);
  const currentPrice = Number(trade.current_sell_price || buyPrice || 0);
  const investment = Number(trade.amount_invested || buyPrice * quantity || 0);
  return {
    id: `trade-${trade.trade_id}`,
    ticker: trade.stock_ticker,
    name: trade.stock_name || trade.stock_ticker,
    sector: trade.sector || "Unclassified",
    buyPrice,
    currentPrice,
    investment,
    quantity,
    allocationPercent: Number(trade.allocation_percent || 0) || (totalCapital > 0 ? (investment / totalCapital) * 100 : 0),
    pnl: (currentPrice - buyPrice) * quantity,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function Dashboard({ userName, studentId }: { userName: string; studentId: string }) {
  const [tab, setTab] = useState<DashboardTab>("portfolio");
  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "portfolio", label: "Portfolio" },
    { id: "overview", label: "Overview" },
    { id: "allocation", label: "Allocation" },
    { id: "market", label: "Market" },
  ];
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  const [activeHoldings, setActiveHoldings] = useState<ActiveHolding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [chartPerf, setChartPerf] = useState<number[]>([]);
  const [chartBench, setChartBench] = useState<number[]>([]);
  const [latestScore, setLatestScore] = useState<BackendWeeklyScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [deletingTicker, setDeletingTicker] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const refreshSummary = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const data = await portfolio.getSummary(studentId);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshHoldings = async () => {
    if (!studentId) return;
    setHoldingsLoading(true);
    try {
      const tradesResponse = await portfolio.getTrades(studentId).catch(() => ({ trades: [] as BackendTrade[] }));
      const totalCapital = summary?.total_capital ?? 10000;
      const optimisticHoldings = tradesResponse.trades.map((trade) => tradeToActiveHolding(trade, totalCapital));

      if (optimisticHoldings.length > 0) {
        setActiveHoldings(optimisticHoldings);
        setHoldingsLoading(false);
      }

      const tickers = tradesResponse.trades
        .map((trade) => trade.stock_ticker)
        .filter((ticker): ticker is string => Boolean(ticker));

      const [response, batchPrices] = await Promise.all([
        portfolio.getHoldings(studentId),
        tickers.length > 0 ? market.getBatchPrices(tickers).catch(() => null) : Promise.resolve(null),
      ]);

      const priceMap = batchPrices?.prices || {};
      setActiveHoldings(response.holdings.map((holding) => {
        const ticker = holding.stock_ticker?.toUpperCase();
        const livePrice = ticker ? priceMap[ticker]?.price : undefined;
        return holdingToActiveHolding({
          ...holding,
          current_price: livePrice ?? holding.current_price,
          price_stale: ticker ? priceMap[ticker]?.is_stale : holding.price_stale,
        }, totalCapital);
      }));
    } catch {
      if (activeHoldings.length === 0) {
        setActiveHoldings([]);
      }
    } finally {
      setHoldingsLoading(false);
    }
  };

  useEffect(() => {
    if (!studentId) return;
    void refreshSummary();
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;

    async function loadHoldings() {
      if (!active) return;
      await refreshHoldings();
    }

    void loadHoldings();
    const timer = setInterval(() => void loadHoldings(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [studentId, summary?.total_capital]);

  useEffect(() => {
    getMarketIndices()
      .then(setMarketIndices)
      .catch(() => setMarketIndices([]));
  }, []);

  useEffect(() => {
    if (!studentId) return;
    const end = new Date();
    const start = new Date(end.getTime() - 49 * 24 * 60 * 60 * 1000);
    market
      .getBenchmark(isoDate(start), isoDate(end))
      .then((data) => setChartBench(sampleAndNormalize(data.benchmark, CHART_POINTS)))
      .catch(() => setChartBench([]));
  }, [studentId]);

  useEffect(() => {
    if (!summary) return;
    setChartPerf(portfolioLine(summary.total_capital, summary.total_portfolio, CHART_POINTS));
  }, [summary]);

  useEffect(() => {
    if (!studentId) return;
    setScoreLoading(true);
    analytics
      .computeScores(studentId)
      .catch(() => null)
      .then(() => analytics.getScores(studentId))
      .then((data) => {
        if (data.scores.length === 0) {
          setLatestScore(null);
          return;
        }
        setLatestScore(data.scores.reduce((max, score) => (score.week_number > max.week_number ? score : max)));
      })
      .catch(() => setLatestScore(null))
      .finally(() => setScoreLoading(false));
  }, [studentId]);

  const portfolioValue = summary
    ? `$${summary.total_portfolio.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
  const returnPct = summary
    ? `${summary.total_return_pct >= 0 ? "+" : ""}${summary.total_return_pct.toFixed(1)}%`
    : "—";
  const pnlLabel = summary ? `${summary.total_pnl >= 0 ? "+" : ""}$${summary.total_pnl.toFixed(2)} P&L` : "Loading...";
  const cashLabel = summary ? `$${summary.cash_balance.toFixed(2)} cash` : "—";
  const returnColor = summary && summary.total_return_pct < 0 ? C.red : C.green;

  const handleDeleteHolding = async (holding: ActiveHolding) => {
    setDeletingTicker(holding.ticker);
    setDeleteError("");
    try {
      try {
        await portfolio.deleteHolding(holding.ticker);
      } catch {
        await portfolio.executeTrade({
          stock_ticker: holding.ticker,
          stock_name: holding.name,
          sector: holding.sector,
          trade_type: "SELL",
          quantity: Math.max(1, Math.floor(holding.quantity)),
          current_sell_price: holding.currentPrice,
          amount_invested: holding.currentPrice * holding.quantity,
        });
      }
      setActiveHoldings((items) => items.filter((item) => item.ticker !== holding.ticker));
      await refreshSummary();
      await refreshHoldings();
      Toast.show({
        type: "success",
        text1: "Stock Deleted",
        text2: `${holding.name} (${holding.ticker}) deleted successfully.`,
      });
      analytics.computeScores(studentId).catch(() => null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : `Could not delete ${holding.ticker}.`);
      await refreshHoldings();
    } finally {
      setDeletingTicker(null);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text selectable style={{ color: C.text0, fontFamily: font.heading, fontSize: 29, textTransform: "uppercase" }}>
          Welcome, {userName.split(" ")[0] || "Analyst"}
        </Text>
        <View style={{ height: 1, marginTop: 14, backgroundColor: C.border }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => setTab(item.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: active ? "rgba(49,230,255,0.14)" : "rgba(255,255,255,0.05)",
                borderColor: active ? C.cyan : C.border,
                borderWidth: 1,
              }}
            >
              <Text selectable style={{ color: active ? C.cyan : C.text2, fontFamily: font.medium, fontSize: 12 }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {tab === "portfolio" ? (
        <GlassCard style={{ padding: 16, gap: 14, backgroundColor: "rgba(10,16,32,0.96)" }} accent={C.cyan}>
          <SectionTitle
            title={`Active Holdings (${activeHoldings.length})`}
            accent={C.cyan}
            right={<Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 11 }}>Live prices refresh every minute</Text>}
          />
          {deleteError ? (
            <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,95,126,0.38)", backgroundColor: "rgba(255,95,126,0.10)" }}>
              <Text selectable style={{ color: C.red, fontSize: 12, lineHeight: 17 }}>
                {deleteError}
              </Text>
            </View>
          ) : null}
          {holdingsLoading && activeHoldings.length === 0 ? (
            <ActivityIndicator color={C.cyan} />
          ) : activeHoldings.length === 0 ? (
            <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.035)" }}>
              <Text selectable style={{ color: C.text2, fontSize: 12 }}>
                No active stocks yet. Submit stocks from Portfolio and they will appear here.
              </Text>
            </View>
          ) : (
            activeHoldings.map((holding) => {
              const pnlPct = holding.investment > 0 ? (holding.pnl / holding.investment) * 100 : 0;
              const pnlColor = holding.pnl >= 0 ? C.green : C.red;
              return (
                <View key={holding.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.035)" }}>
                  <View style={{ width: 54, height: 44, borderRadius: 10, borderWidth: 1, borderColor: `${C.cyan}66`, backgroundColor: "rgba(49,230,255,0.10)", alignItems: "center", justifyContent: "center" }}>
                    <Text selectable numberOfLines={1} style={{ color: C.cyan, fontFamily: font.mono, fontSize: 12 }}>{holding.ticker}</Text>
                  </View>
                  <View style={{ flex: 1.4, minWidth: 170 }}>
                    <Text selectable numberOfLines={1} style={{ color: C.text0, fontFamily: font.medium, fontSize: 15 }}>{holding.name}</Text>
                    <Text selectable numberOfLines={1} style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, marginTop: 3, textTransform: "uppercase" }}>{holding.sector}</Text>
                  </View>
                  <View style={{ minWidth: 116 }}>
                    <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Buy Price</Text>
                    <Text selectable style={{ color: C.text1, fontFamily: font.mono, fontSize: 13, marginTop: 4 }}>{formatMoney(holding.buyPrice)}</Text>
                  </View>
                  <View style={{ minWidth: 132 }}>
                    <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Current Price</Text>
                    <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 13, marginTop: 4 }}>{formatMoney(holding.currentPrice)}</Text>
                  </View>
                  <View style={{ minWidth: 128 }}>
                    <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Investment</Text>
                    <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 13, marginTop: 4 }}>{formatMoney(holding.investment)}</Text>
                    <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, marginTop: 3 }}>{holding.allocationPercent.toFixed(0)}% Allocation</Text>
                  </View>
                  <View style={{ minWidth: 120 }}>
                    <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Returns P&L</Text>
                    <Text selectable style={{ color: pnlColor, fontFamily: font.mono, fontSize: 14, marginTop: 4 }}>{holding.pnl >= 0 ? "+" : ""}{formatMoney(holding.pnl)}</Text>
                    <Text selectable style={{ color: pnlColor, fontFamily: font.mono, fontSize: 11, marginTop: 3 }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</Text>
                  </View>

                  <TouchableOpacity
                    accessibilityLabel={`Delete ${holding.ticker}`}
                    disabled={deletingTicker === holding.ticker}
                    onPress={() => void handleDeleteHolding(holding)}
                    style={{ width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,95,126,0.10)", borderColor: "rgba(255,95,126,0.38)", borderWidth: 1, opacity: deletingTicker === holding.ticker ? 0.55 : 1 }}
                  >
                    <Trash2 size={18} color={C.red} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </GlassCard>
      ) : null}

      {tab === "overview" ? (
        <GlassCard style={{ padding: 16 }} accent={C.cyan}>
          <SectionTitle title="Portfolio Overview" accent={C.cyan} />
          <LineChart perfData={chartPerf} benchmarkData={chartBench} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
            <Legend color={C.cyan} label="Portfolio" />
            <Legend color={C.text2} label="Benchmark" />
          </View>
        </GlassCard>
      ) : null}

      {tab === "allocation" && summary ? (
        <GlassCard style={{ padding: 16, gap: 12 }} accent={C.purple}>
          <SectionTitle title="Allocation" accent={C.purple} />
          <Progress label="Holdings" value={Math.round((summary.holdings_value / summary.total_capital) * 100)} color={C.green} />
          <Progress label="Cash" value={Math.round((summary.cash_balance / summary.total_capital) * 100)} color={C.cyan} />
        </GlassCard>
      ) : null}

      {tab === "market" ? (
        <GlassCard style={{ padding: 16, gap: 8 }} accent={C.cyan}>
          {(() => {
            const indices = marketIndices.filter((idx) => INDIAN_TICKERS.includes(idx.ticker));
            const displayList = indices.length > 0 ? indices : marketIndices;
            if (displayList.length === 0) {
              return <Text style={{ color: C.text2, fontSize: 12 }}>Loading indices…</Text>;
            }
            return displayList.map((idx) => (
              <View
                key={idx.ticker}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  borderBottomColor: C.border,
                  borderBottomWidth: 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {idx.up ? (
                    <TrendingUp size={15} color={C.green} />
                  ) : (
                    <TrendingDown size={15} color={C.red} />
                  )}
                  <Text selectable style={{ color: C.text1, fontFamily: font.medium, fontSize: 13 }}>
                    {idx.name}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 13 }}>
                    {idx.price}
                  </Text>
                  <Text
                    selectable
                    style={{ color: idx.up ? C.green : C.red, fontFamily: font.mono, fontSize: 11 }}
                  >
                    {idx.change}
                  </Text>
                </View>
              </View>
            ));
          })()}
        </GlassCard>
      ) : null}

    </View>
  );
}
