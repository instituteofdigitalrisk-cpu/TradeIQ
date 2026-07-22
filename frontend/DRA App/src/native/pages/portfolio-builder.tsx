import { Check, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import Toast from "react-native-toast-message";
import { C, font, glossary, glossaryTerms, sectorOptions } from "../constants";
import { getTourSeen, setTourSeen } from "../tour-store";
import { analytics, market, portfolio, watchlist } from "../api";
import type { StockSearchResult } from "../api";
import type { Position, UserData } from "../types";
import { wordCount } from "../utils";
import { AppButton, Field, GlassCard, Pill, SectionTitle } from "../components/ui";

const tagOptions = ["Earnings Play", "Macro Tailwind", "Valuation Gap", "Momentum", "Risk Hedge", "(optional)"];
const MAX_SINGLE_ALLOCATION = 30;
const portfolioGuide = [
  {
    title: "Step 1: Search a stock",
    body: "Choose one stock, confirm the sector, and keep the thesis short and decision-ready.",
    accent: C.cyan,
    target: "Select Stock panel, highlighted below",
  },
  {
    title: "Step 2: Set allocation",
    body: "Set how much of your capital to commit to this stock. A single position cannot exceed 30% of total capital.",
    accent: C.green,
    target: "Allocation panel, highlighted below",
  },
  {
    title: "Step 3: Save to Watchlist",
    body: "Not ready to commit capital yet? Save to Watchlist to track the stock and its price. You can edit it or submit it later from the Watchlist tab on your Dashboard.",
    accent: C.gold,
    target: "Save to Watchlist button, highlighted below",
  },
  {
    title: "Step 4: Submit",
    body: "Ready now? Submit adds the stock straight to your active holdings — only submitted stocks count toward your allocation and score.",
    accent: C.purple,
    target: "Submit button, highlighted below",
  },
];
function today() {
  return new Date().toLocaleDateString("en-GB");
}

function makeTrade(studentId: string, index: number, capital: number): Position {
  return {
    id: `${Date.now()}-${index}`,
    tradeId: `TRD${String(index + 1).padStart(6, "0")}`,
    studentId,
    addedBy: studentId,
    tradeDate: today(),
    stockTicker: "",
    stockName: "",
    sector: "Technology",
    allocationPercent: 10,
    amountInvested: `$${Math.round(capital * 0.1).toLocaleString()}`,
    buyPrice: "",
    currentSellPrice: "",
    tradeType: "Buy",
    tag1: "Earnings Play",
    tag2: "Macro Tailwind",
    tag3: "(optional)",
    thesis: "",
  };
}

function OptionRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text selectable style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((option) => (
          <Pill key={option} label={option} active={value === option} onPress={() => onChange(option)} />
        ))}
      </ScrollView>
    </View>
  );
}

function CompactSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, minWidth: 130 }}>
      <Text selectable style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase", marginBottom: 7 }}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 12, justifyContent: "center" }}
      >
        <Text selectable numberOfLines={1} style={{ color: C.text0, fontFamily: font.medium, fontSize: 12 }}>
          {value}
        </Text>
      </TouchableOpacity>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.44)", justifyContent: "center", padding: 24 }}>
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bg1, overflow: "hidden", maxWidth: 360, width: "100%", alignSelf: "center" }}>
            {options.map((option, index) => (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                style={{ paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: index < options.length - 1 ? 1 : 0, borderBottomColor: C.border, backgroundColor: value === option ? "rgba(49,230,255,0.14)" : "rgba(255,255,255,0.03)" }}
              >
                <Text selectable style={{ color: value === option ? C.cyan : C.text1, fontFamily: font.medium, fontSize: 13 }}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function StockSearchField({
  ticker,
  onSelect,
}: {
  ticker: string;
  onSelect: (data: { ticker: string; name: string; sector: string; buyPrice: string; currentSellPrice: string }) => void;
}) {
  const [query, setQuery] = useState(ticker);
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchError, setSearchError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(ticker);
  }, [ticker]);

  const handleChange = (text: string) => {
    setQuery(text.toUpperCase());
    setShowResults(false);
    setSearchError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await market.search(text);
        setResults(res.results.slice(0, 6));
        setShowResults(res.results.length > 0);
      } catch (err) {
        setResults([]);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSelect = async (result: StockSearchResult) => {
    setQuery(result.ticker);
    setShowResults(false);
    setResults([]);
    setSearching(true);
    try {
      const priceData = await market.getPrice(result.ticker);
      const priceStr = String(priceData.price);
      onSelect({
        ticker: result.ticker,
        name: result.name ?? result.ticker,
        sector: result.sector ?? "Foreign Stock",
        buyPrice: priceStr,
        currentSellPrice: priceStr,
      });
    } catch {
      onSelect({
        ticker: result.ticker,
        name: result.name ?? result.ticker,
        sector: result.sector ?? "Foreign Stock",
        buyPrice: "",
        currentSellPrice: "",
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <View style={{ gap: 4 }}>
      <Text selectable style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}>
        Search Stock
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={handleChange}
          placeholder="Name or ticker — e.g. Infosys, AAPL"
          placeholderTextColor={C.text2}
          style={{
            flex: 1,
            height: 50,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: C.border,
            paddingHorizontal: 14,
            color: C.text0,
            fontFamily: font.regular,
            fontSize: 14,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        />
        {searching && <ActivityIndicator size="small" color={C.cyan} />}
      </View>
      {searchError ? (
        <Text selectable style={{ color: C.red, fontSize: 11, marginTop: 2 }}>{searchError}</Text>
      ) : null}
      {showResults && results.length > 0 && (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: "hidden", marginTop: 2 }}>
          {results.map((result, idx) => (
            <TouchableOpacity
              key={result.ticker}
              onPress={() => handleSelect(result)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: idx % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.055)",
                borderBottomWidth: idx < results.length - 1 ? 1 : 0,
                borderBottomColor: C.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text selectable style={{ color: C.cyan, fontFamily: font.mono, fontSize: 13 }}>{result.ticker}</Text>
                <Text selectable style={{ color: C.text1, fontSize: 12, marginTop: 1 }}>{result.name ?? "—"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text selectable style={{ color: C.text2, fontSize: 11 }}>{result.exchange ?? ""}</Text>
                {result.sector ? (
                  <Text selectable style={{ color: C.text2, fontSize: 10, marginTop: 1 }}>{result.sector}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export function PortfolioBuilder({ userData, onSubmitSuccess }: { userData: UserData | null; onSubmitSuccess?: () => void }) {
  const studentId = userData?.studentId || "202600000000";
  const { width } = useWindowDimensions();
  const isNarrow = width < 430;
  const [capitalAmount, setCapitalAmount] = useState(10000);
  const [committedPercent, setCommittedPercent] = useState(0);
  const [tradeSequence, setTradeSequence] = useState(1);
  const [currentPosition, setCurrentPosition] = useState<Position>(() => makeTrade(studentId, 0, capitalAmount));
  const [activeGlossary, setActiveGlossary] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [guideIndex, setGuideIndex] = useState(0);
  const [guideVisible, setGuideVisible] = useState(false);
  const tourKey = `dra.tourSeen.portfolio.${studentId || "guest"}`;

  const refreshCapitalSummary = (id: string) =>
    portfolio.getSummary(id)
      .then((s) => {
        setCapitalAmount(s.total_capital);
        setCommittedPercent(s.total_capital > 0 ? Math.round((s.holdings_value / s.total_capital) * 1000) / 10 : 0);
        setCurrentPosition((prev) => ({
          ...prev,
          amountInvested: `$${Math.round((s.total_capital * Number(prev.allocationPercent || 0)) / 100).toLocaleString()}`,
        }));
      })
      .catch(() => {});

  useEffect(() => {
    if (!userData?.studentId) return;
    let active = true;
    void refreshCapitalSummary(userData.studentId);

    Promise.all([watchlist.list(userData.studentId).catch(() => ({ count: 0 })), portfolio.getTrades(userData.studentId).catch(() => ({ count: 0 }))])
      .then(([w, t]) => {
        if (!active) return;
        const nextSequence = (w.count || 0) + (t.count || 0) + 1;
        setTradeSequence(nextSequence);
        setCurrentPosition((prev) => ({ ...prev, tradeId: `TRD${String(nextSequence).padStart(6, "0")}` }));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [userData?.studentId]);

  useEffect(() => {
    let active = true;
    getTourSeen(tourKey).then((seen) => {
      if (!active || seen) return;
      setGuideIndex(0);
      setGuideVisible(true);
    });
    return () => {
      active = false;
    };
  }, [tourKey]);

  useEffect(() => {
    if (!guideVisible) return;
    const timer = setInterval(() => {
      setGuideIndex((index) => {
        const next = index + 1;
        if (next >= portfolioGuide.length) {
          setGuideVisible(false);
          void setTourSeen(tourKey);
          return index;
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [guideVisible, tourKey]);

  const dismissPortfolioGuide = () => {
    setGuideVisible(false);
    void setTourSeen(tourKey);
  };

  const hasCurrentStock = Boolean(currentPosition.stockTicker.trim());
  const allocationPercent = Number(currentPosition.allocationPercent || 0);
  const exceedsSingleCap = hasCurrentStock && allocationPercent > MAX_SINGLE_ALLOCATION;

  const notify = (type: "success" | "error" | "info" | "warning", text1: string, text2: string) => {
    Toast.show({ type, text1, text2 });
  };

  const resetCurrentPosition = () => {
    setTradeSequence((seq) => {
      const nextSequence = seq + 1;
      setCurrentPosition({ ...makeTrade(studentId, 0, capitalAmount), tradeId: `TRD${String(nextSequence).padStart(6, "0")}` });
      return nextSequence;
    });
  };

  const updateCurrentPosition = (field: keyof Position, value: string | number) => {
    setCurrentPosition((position) => {
      const next = { ...position, [field]: value };
      if (field === "allocationPercent") next.amountInvested = `$${Math.round((capitalAmount * Number(value || 0)) / 100).toLocaleString()}`;
      return next;
    });
  };

  const tradeFieldsFromCurrent = () => {
    const rawAmount = parseFloat(currentPosition.amountInvested.replace(/[^0-9.]/g, "")) || 0;
    const rawPrice = parseFloat(currentPosition.buyPrice.replace(/[^0-9.]/g, "")) || 0;
    const quantity = rawPrice > 0 && rawAmount > 0 ? Math.max(1, Math.round(rawAmount / rawPrice)) : 1;
    return {
      stock_ticker: currentPosition.stockTicker,
      stock_name: currentPosition.stockName || currentPosition.stockTicker,
      sector: currentPosition.sector || undefined,
      allocation_percent: allocationPercent,
      amount_invested: rawAmount > 0 ? rawAmount : undefined,
      quantity,
      buy_price: rawPrice,
      current_sell_price: parseFloat(currentPosition.currentSellPrice.replace(/[^0-9.]/g, "")) || rawPrice,
      trade_type: (currentPosition.tradeType === "Sell" ? "SELL" : "BUY") as "BUY" | "SELL",
      tag1: currentPosition.tag1 === "(optional)" ? undefined : currentPosition.tag1 || undefined,
      tag2: currentPosition.tag2 === "(optional)" ? undefined : currentPosition.tag2 || undefined,
      tag3: currentPosition.tag3 === "(optional)" ? undefined : currentPosition.tag3 || undefined,
      thesis: currentPosition.thesis || undefined,
    };
  };

  const saveToWatchlist = async () => {
    if (!hasCurrentStock) {
      notify("warning", "Add a stock first", "Search and select a stock before saving it to your Watchlist.");
      return;
    }
    if (exceedsSingleCap) {
      const message = `A single position cannot exceed ${MAX_SINGLE_ALLOCATION}% of total capital. Currently set to ${allocationPercent}%.`;
      setDraftStatus(message);
      notify("warning", "Allocation too high", message);
      return;
    }
    try {
      const { item } = await watchlist.add(tradeFieldsFromCurrent());
      const message = `${item.stock_ticker} saved to your Watchlist. Track it there, or come back anytime to submit it.`;
      setDraftStatus(message);
      notify("success", "Saved to Watchlist", `${item.stock_ticker} is now in your Watchlist. Edit or submit it anytime from the Watchlist tab on your Dashboard.`);
      resetCurrentPosition();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save to watchlist.";
      setDraftStatus(message);
      notify("error", "Save failed", message);
    }
  };

  async function submitToBackend() {
    if (!userData?.studentId) {
      setDraftStatus("Not logged in.");
      notify("error", "Submission failed", "You must be logged in to submit.");
      return;
    }
    if (!hasCurrentStock) {
      notify("warning", "Add a stock first", "Search and select a stock before submitting.");
      return;
    }
    if (exceedsSingleCap) {
      const message = `A single position cannot exceed ${MAX_SINGLE_ALLOCATION}% of total capital. Currently set to ${allocationPercent}%.`;
      setDraftStatus(message);
      notify("warning", "Allocation too high", message);
      return;
    }
    setDraftStatus("Submitting to server...");
    try {
      const { trade } = await portfolio.executeTrade(tradeFieldsFromCurrent());
      try {
        await analytics.computeScores(userData.studentId);
        setDraftStatus(`${trade.stock_ticker} submitted successfully. It now appears in your active holdings. Score and leaderboard updated.`);
        notify("success", "Stock submitted", `${trade.stock_ticker} is now an active holding and counts toward your allocation and score.`);
      } catch {
        setDraftStatus(`${trade.stock_ticker} submitted successfully. It now appears in your active holdings.`);
        notify("success", "Stock submitted", `${trade.stock_ticker} is now an active holding. Your score will update after the next scoring run.`);
      }
      void refreshCapitalSummary(userData.studentId);
      setSubmitted(true);
      resetCurrentPosition();
      onSubmitSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed";
      setDraftStatus(message);
      notify("error", "Submission failed", message);
    }
  }

  const statusText = exceedsSingleCap
    ? `Exceeds the ${MAX_SINGLE_ALLOCATION}% single-position limit.`
    : hasCurrentStock
      ? `Within the ${MAX_SINGLE_ALLOCATION}% single-position limit.`
      : "Select a stock to set its allocation.";

  return (
    <View style={{ gap: 16 }}>
      {submitted ? (
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: "rgba(30,230,163,0.12)", borderColor: "rgba(30,230,163,0.30)", borderWidth: 1, flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Check size={18} color={C.green} />
          <Text selectable style={{ color: C.green, fontFamily: font.medium, fontSize: 13 }}>
            Portfolio setup and trade log saved
          </Text>
        </View>
      ) : null}
      {draftStatus ? (
        <View style={{ padding: 12, borderRadius: 14, backgroundColor: "rgba(49,230,255,0.08)", borderColor: "rgba(49,230,255,0.22)", borderWidth: 1 }}>
          <Text selectable style={{ color: C.cyan, fontFamily: font.medium, fontSize: 12, lineHeight: 17 }}>
            {draftStatus}
          </Text>
        </View>
      ) : null}

      <View>
        <Text selectable style={{ color: C.text0, fontFamily: font.heading, fontSize: 29, textTransform: "uppercase" }}>
          Portfolio Setup
        </Text>
      </View>

      {guideVisible ? (() => {
        const guide = portfolioGuide[guideIndex];
        return (
          <View style={{ alignSelf: "flex-start", width: Math.min(320, width - 32), padding: 14, borderRadius: 14, borderWidth: 1, borderColor: `${guide.accent}77`, backgroundColor: "rgba(10,16,32,0.98)", boxShadow: `0 14px 34px ${guide.accent}22`, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text selectable style={{ color: guide.accent, fontFamily: font.medium, fontSize: 11, textTransform: "uppercase" }}>
                Quick Tour {guideIndex + 1}/{portfolioGuide.length}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: `${guide.accent}55` }} />
              <TouchableOpacity accessibilityLabel="Skip tour" onPress={dismissPortfolioGuide} style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderColor: C.border, borderWidth: 1 }}>
                <X size={12} color={C.text1} />
              </TouchableOpacity>
            </View>
            <Text selectable style={{ color: C.text0, fontFamily: font.heading, fontSize: 15, textTransform: "uppercase" }}>
              {guide.title}
            </Text>
            <Text selectable style={{ color: C.text1, fontSize: 12, lineHeight: 17 }}>
              {guide.body}
            </Text>
            <Text selectable style={{ color: guide.accent, fontSize: 11, fontFamily: font.medium }}>
              → {guide.target}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
              {portfolioGuide.map((step, index) => (
                <View key={step.title} style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: index <= guideIndex ? guide.accent : C.bg3 }} />
              ))}
            </View>
          </View>
        );
      })() : null}

      
      <GlassCard
        style={{
          padding: 16,
          gap: 14,
          backgroundColor: "rgba(8,35,33,0.82)",
          borderColor: exceedsSingleCap ? "rgba(255,95,126,0.34)" : "rgba(30,230,163,0.30)",
          ...(guideVisible && guideIndex === 1 ? { borderWidth: 2, borderColor: portfolioGuide[1].accent, boxShadow: `0 0 0 4px ${portfolioGuide[1].accent}22, 0 0 22px ${portfolioGuide[1].accent}55` } : null),
        }}
        accent={exceedsSingleCap ? C.red : C.green}
      >
        <SectionTitle title="Allocation" accent={C.purple} />

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text selectable style={{ color: C.text2, fontSize: 11, textTransform: "uppercase" }}>Committed across active holdings</Text>
            <Text selectable style={{ color: C.purple, fontFamily: font.mono, fontSize: 25 }}>{committedPercent}%</Text>
          </View>
          <View style={{ height: 14, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" }}>
            <View style={{ width: `${Math.min(committedPercent, 100)}%`, height: "100%", backgroundColor: C.purple }} />
          </View>   
          <Text selectable style={{ color: C.text2, fontSize: 11, lineHeight: 15 }}>
            Rises only once a stock is Submitted — Watchlist entries don't count.
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: C.border }} />

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text selectable style={{ color: C.text2, fontSize: 11, textTransform: "uppercase" }}>This stock's allocation</Text>
            <Text selectable style={{ color: exceedsSingleCap ? C.red : C.green, fontFamily: font.mono, fontSize: 15 }}>{allocationPercent}%</Text>
          </View>
          <Text selectable style={{ color: C.text2, fontSize: 11, lineHeight: 15 }}>
            A single position cannot exceed {MAX_SINGLE_ALLOCATION}% of total capital (${capitalAmount.toLocaleString()}).
          </Text>
          <View style={{ height: 14, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)" }}>
            <View style={{ width: `${Math.min(allocationPercent, 100)}%`, height: "100%", backgroundColor: exceedsSingleCap ? C.red : C.green }} />
          </View>
          <Text selectable style={{ color: exceedsSingleCap ? C.red : hasCurrentStock ? C.green : C.text2, fontFamily: font.medium, fontSize: 12 }}>
            {statusText}
          </Text>
        </View>

      </GlassCard>

      <GlassCard style={{ padding: 16, gap: 12, backgroundColor: "rgba(10,16,32,0.94)", borderColor: "rgba(49,230,255,0.24)", ...(guideVisible && guideIndex === 0 ? { borderWidth: 2, borderColor: portfolioGuide[0].accent, boxShadow: `0 0 0 4px ${portfolioGuide[0].accent}22, 0 0 22px ${portfolioGuide[0].accent}55` } : null) }} accent={C.cyan}>
        <SectionTitle
          title="Select Stock"
          accent={C.cyan}
          right={<TouchableOpacity onPress={resetCurrentPosition} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderColor: C.border2, borderWidth: 1 }}>
            <X size={14} color={C.text1} />
            <Text selectable style={{ color: C.text1, fontFamily: font.medium, fontSize: 12 }}>Clear</Text>
          </TouchableOpacity>}
        />
        <Text selectable style={{ color: C.text2, fontSize: 12, lineHeight: 17 }}>
          Fill in one stock, then choose Save to Watchlist to track it without committing capital, or Submit to add it straight to your active holdings.
        </Text>
        <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.045)", borderColor: C.border, borderWidth: 1, borderTopWidth: 3, borderTopColor: C.cyan }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Trade ID" value={currentPosition.tradeId} onChangeText={() => undefined} placeholder="TRD000001" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Trade Date" value={currentPosition.tradeDate} onChangeText={(value) => updateCurrentPosition("tradeDate", value)} placeholder="01/06/2026" />
            </View>
          </View>
          <View style={{ flexDirection: isNarrow ? "column" : "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ flex: 1, width: isNarrow ? "100%" : undefined }}>
              <StockSearchField
                ticker={currentPosition.stockTicker}
                onSelect={(data) => {
                  setCurrentPosition((position) => ({
                    ...position,
                    stockTicker: data.ticker,
                    stockName: data.name,
                    sector: data.sector,
                    buyPrice: data.buyPrice,
                    currentSellPrice: data.currentSellPrice,
                  }));
                }}
              />
            </View>
            <View style={{ flex: 1, width: isNarrow ? "100%" : undefined }}>
              <Field label="Stock Name" value={currentPosition.stockName} onChangeText={(value) => updateCurrentPosition("stockName", value)} placeholder="Apple Inc" />
            </View>
          </View>
          <OptionRow label="Sector" options={sectorOptions} value={currentPosition.sector} onChange={(value) => updateCurrentPosition("sector", value)} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Allocation %" value={String(currentPosition.allocationPercent)} onChangeText={(value) => updateCurrentPosition("allocationPercent", Number(value.replace(/\D/g, "").slice(0, 3)) || 0)} placeholder="20" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Amount Invested" value={currentPosition.amountInvested} onChangeText={(value) => updateCurrentPosition("amountInvested", value)} placeholder="$2,000" />
            </View>
          </View>
          {exceedsSingleCap ? (
            <Text selectable style={{ color: C.red, fontSize: 11, lineHeight: 16 }}>
              {allocationPercent}% exceeds the {MAX_SINGLE_ALLOCATION}% single-position limit. Lower it before saving or submitting.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Buy Price" value={currentPosition.buyPrice} onChangeText={(value) => updateCurrentPosition("buyPrice", value)} placeholder="$189.50" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Current / Sell Price" value={currentPosition.currentSellPrice} onChangeText={(value) => updateCurrentPosition("currentSellPrice", value)} placeholder="$201.00" keyboardType="decimal-pad" />
            </View>
          </View>
          <OptionRow label="Trade Type" options={["Buy", "Sell"]} value={currentPosition.tradeType} onChange={(value) => updateCurrentPosition("tradeType", value)} />
          <View style={{ flexDirection: isNarrow ? "column" : "row", gap: 10 }}>
            <CompactSelect label="Tag 1" options={tagOptions} value={currentPosition.tag1} onChange={(value) => updateCurrentPosition("tag1", value)} />
            <CompactSelect label="Tag 2" options={tagOptions} value={currentPosition.tag2} onChange={(value) => updateCurrentPosition("tag2", value)} />
            <CompactSelect label="Tag 3" options={tagOptions} value={currentPosition.tag3} onChange={(value) => updateCurrentPosition("tag3", value)} />
          </View>
          <Field label="Thesis" value={currentPosition.thesis} onChangeText={(value) => updateCurrentPosition("thesis", value)} placeholder="Max 50 words" multiline />
          <Text selectable style={{ color: wordCount(currentPosition.thesis) <= 50 ? C.text2 : C.red, fontSize: 10, alignSelf: "flex-end" }}>
            {wordCount(currentPosition.thesis)}/50 words
          </Text>
        </View>
      </GlassCard>

      {activeGlossary && glossary[activeGlossary] ? (
        <GlassCard style={{ padding: 16, gap: 10, borderColor: "rgba(49,230,255,0.35)" }} accent={C.cyan}>
          <SectionTitle title={glossary[activeGlossary].term} accent={C.cyan} />
          <Text selectable style={{ color: C.text1, fontSize: 12, lineHeight: 19 }}>{glossary[activeGlossary].def}</Text>
          {glossary[activeGlossary].formula ? (
            <Text selectable style={{ color: C.purple, fontFamily: font.mono, fontSize: 11, lineHeight: 17, backgroundColor: C.bg3, padding: 9, borderRadius: 8 }}>
              {glossary[activeGlossary].formula}
            </Text>
          ) : null}
        </GlassCard>
      ) : null}

      <GlassCard style={{ padding: 16, gap: 12 }} accent={C.gold}>
        <SectionTitle title="Concept Library" accent={C.gold} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {glossaryTerms.map((term) => {
            const active = activeGlossary === term.key;
            return (
              <TouchableOpacity key={term.label} disabled={!term.key} onPress={() => setActiveGlossary(active ? null : term.key)} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderColor: `${term.color}55`, borderWidth: 1, backgroundColor: active ? `${term.color}24` : `${term.color}12`, opacity: term.key ? 1 : 0.72 }}>
                <Text selectable style={{ color: term.color, fontFamily: font.medium, fontSize: 12 }}>{term.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </GlassCard>

      <View style={{ flexDirection: isNarrow ? "column" : "row", gap: 10 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            ...(guideVisible && guideIndex === 2 ? { boxShadow: `0 0 0 4px ${portfolioGuide[2].accent}22, 0 0 22px ${portfolioGuide[2].accent}55` } : null),
          }}
        >
          <AppButton label="Save to Watchlist" onPress={() => void saveToWatchlist()} variant="ghost" disabled={!hasCurrentStock || exceedsSingleCap} />
        </View>
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            ...(guideVisible && guideIndex === 3 ? { boxShadow: `0 0 0 4px ${portfolioGuide[3].accent}22, 0 0 22px ${portfolioGuide[3].accent}55` } : null),
          }}
        >
          <AppButton label="Submit" onPress={() => {
            void submitToBackend();
          }} disabled={!hasCurrentStock || exceedsSingleCap} />
        </View>
      </View>
    </View>
  );
}
