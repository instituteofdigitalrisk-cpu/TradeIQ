import { Check, Pencil, Plus, Trash2, TrendingDown, TrendingUp, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import { analytics, market, portfolio, watchlist } from "../api";
import type { BackendHolding, BackendTrade, BackendWatchlistItem, BackendWeeklyScore, MarketIndex, PortfolioSummary } from "../api";
import { Legend, LineChart } from "../components/charts";
import { GlassCard, Progress, SectionTitle } from "../components/ui";
import { getMarketIndices } from "../market-store";
import { getTourSeen, setTourSeen } from "../tour-store";

const CHART_POINTS = 7;
const INDIAN_TICKERS = ["^NSEI", "^BSESN", "^CNXIT", "^CNXPHARMA"];
const TRENDING_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA"];

type DashboardTab = "portfolio" | "watchlist" | "overview" | "allocation" | "market";
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

const dashboardGuide: Record<DashboardTab, { title: string; body: string; accent: string }> = {
  portfolio: {
    title: "Portfolio",
    body: "Review submitted stocks, live prices, allocation weight, and P&L. This is where your active holdings become easy to monitor.",
    accent: C.cyan,
  },
  watchlist: {
    title: "Watchlist",
    body: "Stocks you saved but haven't committed to yet. Tap one to edit its quantity or thesis, tap + to move it into your active holdings, or delete it if you're no longer interested.",
    accent: C.gold,
  },
  overview: {
    title: "Overview",
    body: "Compare your portfolio movement against the benchmark to understand whether returns are coming from skill or market direction.",
    accent: C.green,
  },
  allocation: {
    title: "Allocation",
    body: "Check how much capital is invested versus held as cash. Keep this balanced before final submission.",
    accent: C.purple,
  },
  market: {
    title: "Market",
    body: "Track major movers and index signals before choosing stocks or adjusting your thesis.",
    accent: C.gold,
  },
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

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function Dashboard({ userName, studentId }: { userName: string; studentId: string }) {
  const [tab, setTab] = useState<DashboardTab>("portfolio");
  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "portfolio", label: "Portfolio" },
    { id: "watchlist", label: "Watchlist" },
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
  const [watchlistItems, setWatchlistItems] = useState<BackendWatchlistItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistError, setWatchlistError] = useState("");
  const [editingWatchlistId, setEditingWatchlistId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editThesis, setEditThesis] = useState("");
  const [savingWatchlistId, setSavingWatchlistId] = useState<number | null>(null);
  const [promotingWatchlistId, setPromotingWatchlistId] = useState<number | null>(null);
  const [deletingWatchlistId, setDeletingWatchlistId] = useState<number | null>(null);
  const [guideIndex, setGuideIndex] = useState(0);
  const [guideVisible, setGuideVisible] = useState(false);
  const [tabRowLayout, setTabRowLayout] = useState({ width: 0, height: 0 });
  const [tabAnchors, setTabAnchors] = useState<Record<string, { x: number; width: number }>>({});
  const { width: windowWidth } = useWindowDimensions();
  const tourKey = `dra.tourSeen.dashboard.${studentId || "guest"}`;

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
      const [response, tradesResponse] = await Promise.all([
        portfolio.getHoldings(studentId),
        portfolio.getTrades(studentId).catch(() => ({ trades: [] as BackendTrade[] })),
      ]);
      const totalCapital = summary?.total_capital ?? 10000;
      const latestTradeByTicker = new Map<string, BackendTrade>();

      tradesResponse.trades
        .slice()
        .reverse()
        .forEach((trade) => {
          const ticker = trade.stock_ticker?.toUpperCase();
          if (!ticker) return;
          latestTradeByTicker.set(ticker, trade);
        });

      setActiveHoldings(response.holdings.map((holding) => {
        const ticker = holding.stock_ticker?.toUpperCase();
        const latestTrade = latestTradeByTicker.get(ticker);
        return holdingToActiveHolding({
          ...holding,
          sector: holding.sector ?? latestTrade?.sector,
          allocation_percent: holding.allocation_percent ?? latestTrade?.allocation_percent,
        }, totalCapital);
      }));
    } catch {
      setActiveHoldings([]);
    } finally {
      setHoldingsLoading(false);
    }
  };

  const refreshWatchlist = async () => {
    if (!studentId) return;
    setWatchlistLoading(true);
    setWatchlistError("");
    try {
      const response = await watchlist.list(studentId);
      setWatchlistItems(response.watchlist);
    } catch (error) {
      setWatchlistError(error instanceof Error ? error.message : "Could not load your watchlist.");
    } finally {
      setWatchlistLoading(false);
    }
  };

  useEffect(() => {
    if (!studentId) return;
    void refreshSummary();
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    getTourSeen(tourKey).then((seen) => {
      if (!active || seen) return;
      setGuideIndex(0);
      setGuideVisible(true);
    });
    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    if (!guideVisible) return;
    const timer = setInterval(() => {
      setGuideIndex((index) => {
        const next = index + 1;
        if (next >= tabs.length) {
          setGuideVisible(false);
          void setTourSeen(tourKey);
          return index;
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [guideVisible, tourKey]);

  const dismissGuide = () => {
    setGuideVisible(false);
    void setTourSeen(tourKey);
  };

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
    if (!studentId) return;
    void refreshWatchlist();
  }, [studentId]);

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

  const startEditingWatchlistItem = (item: BackendWatchlistItem) => {
    if (editingWatchlistId === item.watchlist_id) {
      setEditingWatchlistId(null);
      return;
    }
    setEditingWatchlistId(item.watchlist_id);
    setEditQuantity(String(item.quantity || 0));
    setEditThesis(item.thesis || "");
  };

  const handleSaveWatchlistEdit = async (item: BackendWatchlistItem) => {
    setSavingWatchlistId(item.watchlist_id);
    try {
      const quantity = Math.max(0, Math.round(Number(editQuantity) || 0));
      const { item: updated } = await watchlist.update(item.watchlist_id, { quantity, thesis: editThesis });
      setWatchlistItems((items) => items.map((w) => (w.watchlist_id === item.watchlist_id ? updated : w)));
      setEditingWatchlistId(null);
      Toast.show({ type: "success", text1: "Watchlist updated", text2: `${item.stock_ticker} saved.` });
    } catch (error) {
      Toast.show({ type: "error", text1: "Update failed", text2: error instanceof Error ? error.message : `Could not update ${item.stock_ticker}.` });
    } finally {
      setSavingWatchlistId(null);
    }
  };

  const handlePromoteWatchlistItem = async (item: BackendWatchlistItem) => {
    setPromotingWatchlistId(item.watchlist_id);
    try {
      await portfolio.executeTrade({
        stock_ticker: item.stock_ticker,
        stock_name: item.stock_name || item.stock_ticker,
        sector: item.sector || undefined,
        trade_type: item.trade_type === "SELL" ? "SELL" : "BUY",
        quantity: Math.max(1, Math.round(item.quantity || 1)),
        buy_price: item.buy_price || undefined,
        current_sell_price: item.current_sell_price || item.buy_price || undefined,
        tag1: item.tag1 || undefined,
        tag2: item.tag2 || undefined,
        tag3: item.tag3 || undefined,
        thesis: item.thesis || undefined,
        amount_invested: item.amount_invested || undefined,
      });
      await watchlist.remove(item.watchlist_id);
      setWatchlistItems((items) => items.filter((w) => w.watchlist_id !== item.watchlist_id));
      await refreshSummary();
      await refreshHoldings();
      analytics.computeScores(studentId).catch(() => null);
      Toast.show({
        type: "success",
        text1: "Added to Portfolio",
        text2: `${item.stock_ticker} moved from Watchlist to your active holdings.`,
      });
    } catch (error) {
      Toast.show({ type: "error", text1: "Could not submit", text2: error instanceof Error ? error.message : `Could not submit ${item.stock_ticker}.` });
    } finally {
      setPromotingWatchlistId(null);
    }
  };

  const handleDeleteWatchlistItem = async (item: BackendWatchlistItem) => {
    setDeletingWatchlistId(item.watchlist_id);
    try {
      await watchlist.remove(item.watchlist_id);
      setWatchlistItems((items) => items.filter((w) => w.watchlist_id !== item.watchlist_id));
      if (editingWatchlistId === item.watchlist_id) setEditingWatchlistId(null);
      Toast.show({ type: "info", text1: "Removed from Watchlist", text2: `${item.stock_ticker} removed.` });
    } catch (error) {
      Toast.show({ type: "error", text1: "Delete failed", text2: error instanceof Error ? error.message : `Could not delete ${item.stock_ticker}.` });
    } finally {
      setDeletingWatchlistId(null);
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

      <View onLayout={(e) => setTabRowLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {tabs.map((item, index) => {
            const active = tab === item.id;
            const pointedAt = guideVisible && tabs[guideIndex]?.id === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  setTabAnchors((prev) => ({ ...prev, [item.id]: { x, width } }));
                }}
                onPress={() => {
                  setTab(item.id);
                  if (!guideVisible) setGuideIndex(index);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: active ? "rgba(49,230,255,0.14)" : "rgba(255,255,255,0.05)",
                  borderColor: pointedAt ? dashboardGuide[item.id].accent : active ? C.cyan : C.border,
                  borderWidth: pointedAt ? 2 : 1,
                  boxShadow: pointedAt ? `0 0 0 4px ${dashboardGuide[item.id].accent}22, 0 0 18px ${dashboardGuide[item.id].accent}55` : undefined,
                }}
              >
                <Text selectable style={{ color: active ? C.cyan : C.text2, fontFamily: font.medium, fontSize: 12 }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {guideVisible ? (() => {
          const pointedTab = tabs[guideIndex]?.id ?? tabs[0].id;
          const guide = dashboardGuide[pointedTab];
          const anchor = tabAnchors[pointedTab];
          const boxWidth = tabRowLayout.width > 0 ? Math.min(300, windowWidth - 40, Math.max(tabRowLayout.width, 220)) : Math.min(300, windowWidth - 40);
          const maxLeft = Math.max(tabRowLayout.width - boxWidth, 0);
          const boxLeft = anchor ? Math.min(Math.max(anchor.x + anchor.width / 2 - boxWidth / 2, 0), maxLeft) : 0;
          const arrowLeft = anchor
            ? Math.min(Math.max(anchor.x + anchor.width / 2 - boxLeft - 7, 12), boxWidth - 26)
            : boxWidth / 2 - 7;
          return (
            <View style={{ marginLeft: boxLeft, width: boxWidth, marginTop: 10 }}>
              <View
                style={{
                  marginLeft: arrowLeft,
                  width: 12,
                  height: 12,
                  marginBottom: -7,
                  backgroundColor: "rgba(10,16,32,0.98)",
                  borderColor: `${guide.accent}77`,
                  borderTopWidth: 1,
                  borderLeftWidth: 1,
                  transform: [{ rotate: "45deg" }],
                }}
              />
              <View style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: `${guide.accent}77`, backgroundColor: "rgba(10,16,32,0.98)", boxShadow: `0 14px 34px ${guide.accent}22`, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text selectable style={{ color: guide.accent, fontFamily: font.medium, fontSize: 11, textTransform: "uppercase" }}>
                    Quick Tour {guideIndex + 1}/{tabs.length}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: `${guide.accent}55` }} />
                  <TouchableOpacity accessibilityLabel="Skip tour" onPress={dismissGuide} style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderColor: C.border, borderWidth: 1 }}>
                    <X size={12} color={C.text1} />
                  </TouchableOpacity>
                </View>
                <Text selectable style={{ color: C.text0, fontFamily: font.heading, fontSize: 16, textTransform: "uppercase" }}>
                  {guide.title}
                </Text>
                <Text selectable style={{ color: C.text1, fontSize: 12, lineHeight: 17 }}>
                  {guide.body}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                  {tabs.map((item, index) => (
                    <View key={item.id} style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: index <= guideIndex ? guide.accent : C.bg3 }} />
                  ))}
                </View>
              </View>
            </View>
          );
        })() : null}
      </View>

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

      {tab === "watchlist" ? (
        <GlassCard style={{ padding: 16, gap: 14, backgroundColor: "rgba(10,16,32,0.96)" }} accent={C.gold}>
          <SectionTitle
            title={`Watchlist (${watchlistItems.length})`}
            accent={C.gold}
            right={<Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 11 }}>Tap a stock to edit</Text>}
          />
          {watchlistError ? (
            <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,95,126,0.38)", backgroundColor: "rgba(255,95,126,0.10)" }}>
              <Text selectable style={{ color: C.red, fontSize: 12, lineHeight: 17 }}>
                {watchlistError}
              </Text>
            </View>
          ) : null}
          {watchlistLoading && watchlistItems.length === 0 ? (
            <ActivityIndicator color={C.gold} />
          ) : watchlistItems.length === 0 ? (
            <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.035)" }}>
              <Text selectable style={{ color: C.text2, fontSize: 12 }}>
                Nothing saved yet. Use Save to Watchlist on the Portfolio page to track a stock here before you commit capital to it.
              </Text>
            </View>
          ) : (
            watchlistItems.map((item) => {
              const isEditing = editingWatchlistId === item.watchlist_id;
              const isSaving = savingWatchlistId === item.watchlist_id;
              const isPromoting = promotingWatchlistId === item.watchlist_id;
              const isDeleting = deletingWatchlistId === item.watchlist_id;
              const busy = isSaving || isPromoting || isDeleting;
              return (
                <View key={item.watchlist_id} style={{ borderRadius: 14, borderWidth: 1, borderColor: isEditing ? `${C.gold}77` : C.border, backgroundColor: isEditing ? "rgba(255,209,102,0.06)" : "rgba(255,255,255,0.035)", overflow: "hidden" }}>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    onPress={() => startEditingWatchlistItem(item)}
                    style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, padding: 14 }}
                  >
                    <View style={{ width: 54, height: 44, borderRadius: 10, borderWidth: 1, borderColor: `${C.gold}66`, backgroundColor: "rgba(255,209,102,0.10)", alignItems: "center", justifyContent: "center" }}>
                      <Text selectable numberOfLines={1} style={{ color: C.gold, fontFamily: font.mono, fontSize: 12 }}>{item.stock_ticker}</Text>
                    </View>
                    <View style={{ flex: 1.4, minWidth: 170 }}>
                      <Text selectable numberOfLines={1} style={{ color: C.text0, fontFamily: font.medium, fontSize: 15 }}>{item.stock_name}</Text>
                      <Text selectable numberOfLines={1} style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, marginTop: 3, textTransform: "uppercase" }}>{item.sector || "Unclassified"}</Text>
                    </View>
                    <View style={{ minWidth: 100 }}>
                      <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Allocation</Text>
                      <Text selectable style={{ color: C.text1, fontFamily: font.mono, fontSize: 13, marginTop: 4 }}>{item.allocation_percent}%</Text>
                    </View>
                    <View style={{ minWidth: 100 }}>
                      <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Buy Price</Text>
                      <Text selectable style={{ color: C.text1, fontFamily: font.mono, fontSize: 13, marginTop: 4 }}>{formatMoney(item.buy_price)}</Text>
                    </View>
                    <View style={{ minWidth: 90 }}>
                      <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase" }}>Quantity</Text>
                      <Text selectable style={{ color: C.text1, fontFamily: font.mono, fontSize: 13, marginTop: 4 }}>{item.quantity}</Text>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8, marginLeft: "auto" }}>
                      <TouchableOpacity
                        accessibilityLabel={`Add ${item.stock_ticker} to portfolio`}
                        disabled={busy}
                        onPress={(event) => {
                          event.stopPropagation();
                          void handlePromoteWatchlistItem(item);
                        }}
                        style={{ width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(30,230,163,0.10)", borderColor: "rgba(30,230,163,0.38)", borderWidth: 1, opacity: busy ? 0.55 : 1 }}
                      >
                        {isPromoting ? <ActivityIndicator size="small" color={C.green} /> : <Plus size={18} color={C.green} />}
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityLabel={`Delete ${item.stock_ticker} from watchlist`}
                        disabled={busy}
                        onPress={(event) => {
                          event.stopPropagation();
                          void handleDeleteWatchlistItem(item);
                        }}
                        style={{ width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,95,126,0.10)", borderColor: "rgba(255,95,126,0.38)", borderWidth: 1, opacity: busy ? 0.55 : 1 }}
                      >
                        {isDeleting ? <ActivityIndicator size="small" color={C.red} /> : <Trash2 size={18} color={C.red} />}
                      </TouchableOpacity>
                      <View style={{ width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderColor: C.border2, borderWidth: 1 }}>
                        <Pencil size={16} color={C.text1} />
                      </View>
                    </View>
                  </TouchableOpacity>

                  {isEditing ? (
                    <View style={{ padding: 14, paddingTop: 0, gap: 10 }}>
                      <View style={{ height: 1, backgroundColor: C.border }} />
                      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                        <View style={{ width: 110 }}>
                          <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", marginBottom: 6 }}>Quantity</Text>
                          <TextInput
                            value={editQuantity}
                            onChangeText={setEditQuantity}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={C.text2}
                            style={{ borderRadius: 10, borderWidth: 1, borderColor: C.border2, backgroundColor: "rgba(255,255,255,0.05)", color: C.text0, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.mono, fontSize: 13 }}
                          />
                        </View>
                        <TouchableOpacity
                          disabled={isSaving}
                          onPress={() => void handleSaveWatchlistEdit(item)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: "rgba(255,209,102,0.14)", borderColor: `${C.gold}66`, borderWidth: 1, opacity: isSaving ? 0.6 : 1 }}
                        >
                          {isSaving ? <ActivityIndicator size="small" color={C.gold} /> : <Check size={14} color={C.gold} />}
                          <Text selectable style={{ color: C.gold, fontFamily: font.medium, fontSize: 12 }}>Save</Text>
                        </TouchableOpacity>
                      </View>
                      <View>
                        <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", marginBottom: 6 }}>Thesis</Text>
                        <TextInput
                          value={editThesis}
                          onChangeText={setEditThesis}
                          placeholder="Why this stock?"
                          placeholderTextColor={C.text2}
                          multiline
                          numberOfLines={3}
                          style={{ borderRadius: 10, borderWidth: 1, borderColor: C.border2, backgroundColor: "rgba(255,255,255,0.05)", color: C.text0, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.regular, fontSize: 13, lineHeight: 18, minHeight: 64, textAlignVertical: "top" }}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </GlassCard>
      ) : null}

      {tab === "overview" ? (
        <>
          <GlassCard style={{ padding: 16 }} accent={C.cyan}>
            <SectionTitle title="Portfolio Overview" accent={C.cyan} />
            <LineChart perfData={chartPerf} benchmarkData={chartBench} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              <Legend color={C.cyan} label="Portfolio" />
              <Legend color={C.text2} label="Benchmark" />
            </View>
          </GlassCard>
        </>
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
            const indian = marketIndices.filter((idx) => TRENDING_TICKERS.includes(idx.ticker));
            if (indian.length === 0) {
              return <Text style={{ color: C.text2, fontSize: 12 }}>Loading indices…</Text>;
            }
            return indian.map((idx) => (
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
