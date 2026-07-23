// frontend/DRA App/src/native/pages/portfolio-builder.tsx
import { Check, Trash2, X, Search } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { C, font, glossary, glossaryTerms, sectorOptions } from "../constants";
import { getPortfolioDraft, savePortfolioDraft } from "../portfolio-store";
import { analytics, market, portfolio } from "../api";
import type { BackendTrade, StockSearchResult } from "../api";
import type { Position, PortfolioSetup, UserData } from "../types";
import { wordCount } from "../utils";
import { AppButton, Field, GlassCard, Pill, SectionTitle } from "../components/ui";

const tagOptions = [
  "Earnings Play",
  "Macro Tailwind",
  "Valuation Gap",
  "Momentum",
  "Risk Hedge",
  "(optional)",
];

const tableColumns = [
  { key: "ticker", label: "Ticker", width: 92 },
  { key: "name", label: "Stock", width: 190 },
  { key: "sector", label: "Sector", width: 150 },
  { key: "type", label: "Type", width: 78 },
  { key: "allocation", label: "Alloc.", width: 84 },
  { key: "amount", label: "Amount", width: 112 },
  { key: "buy", label: "Buy", width: 92 },
  { key: "price", label: "Current", width: 96 },
  { key: "thesis", label: "Thesis", width: 180 },
  { key: "action", label: "", width: 64 },
] as const;

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

function money(value: number) {
  return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function displayDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB");
}

function tradeToPosition(trade: BackendTrade, index: number, studentId: string): Position {
  return {
    id: `server-${trade.trade_id}`,
    tradeId: trade.trade_id,
    studentId,
    addedBy: studentId,
    tradeDate: displayDate(trade.trade_date),
    stockTicker: trade.stock_ticker ?? "",
    stockName: trade.stock_name ?? trade.stock_ticker ?? "",
    sector: trade.sector ?? "Technology",
    allocationPercent: Number(trade.allocation_percent || 0),
    amountInvested: money(trade.amount_invested),
    buyPrice: String(trade.buy_price || ""),
    currentSellPrice: String(trade.current_sell_price || trade.buy_price || ""),
    tradeType: trade.trade_type === "SELL" ? "Sell" : "Buy",
    tag1: trade.tag1 ?? "Earnings Play",
    tag2: trade.tag2 ?? "Macro Tailwind",
    tag3: trade.tag3 ?? "(optional)",
    thesis: trade.thesis ?? "",
  };
}

function isSubmittedPosition(position: Position) {
  return position.id.startsWith("server-");
}

function OptionRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        selectable
        style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}
      >
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

function CompactSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, minWidth: 130 }}>
      <Text
        selectable
        style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase", marginBottom: 7 }}
      >
        {label}
      </Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: "rgba(255,255,255,0.04)",
          paddingHorizontal: 12,
          justifyContent: "center",
        }}
      >
        <Text selectable numberOfLines={1} style={{ color: C.text0, fontFamily: font.medium, fontSize: 12 }}>
          {value}
        </Text>
      </TouchableOpacity>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.44)", justifyContent: "center", padding: 24 }}
        >
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: C.border2,
              backgroundColor: C.bg1,
              overflow: "hidden",
              maxWidth: 360,
              width: "100%",
              alignSelf: "center",
            }}
          >
            {options.map((option, index) => (
              <TouchableOpacity
                key={option}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  borderBottomWidth: index < options.length - 1 ? 1 : 0,
                  borderBottomColor: C.border,
                  backgroundColor: value === option ? "rgba(49,230,255,0.14)" : "rgba(255,255,255,0.03)",
                }}
              >
                <Text
                  selectable
                  style={{
                    color: value === option ? C.cyan : C.text1,
                    fontFamily: font.medium,
                    fontSize: 13,
                  }}
                >
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

function DraftTradesTable({
  positions,
  selectedId,
  onSelect,
  onDelete,
}: {
  positions: Position[];
  selectedId: string | null;
  onSelect: (position: Position) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.035)",
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "rgba(49,230,255,0.10)",
              borderBottomColor: C.border,
              borderBottomWidth: 1,
            }}
          >
            {tableColumns.map((column) => (
              <View key={column.key} style={{ width: column.width, paddingHorizontal: 10, paddingVertical: 10 }}>
                <Text
                  selectable
                  style={{ color: C.cyan, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}
                >
                  {column.label}
                </Text>
              </View>
            ))}
          </View>
          {positions.map((position, index) => {
            const cells = [
              position.stockTicker || "-",
              position.stockName || "Select a stock",
              position.sector || "-",
              position.tradeType,
              `${position.allocationPercent || 0}%`,
              position.amountInvested || "-",
              position.buyPrice || "-",
              position.currentSellPrice || "-",
              position.thesis ? `${position.thesis.slice(0, 52)}${position.thesis.length > 52 ? "..." : ""}` : "-",
            ];
            return (
              <TouchableOpacity
                key={position.id}
                activeOpacity={0.78}
                onPress={() => onSelect(position)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor:
                    selectedId === position.id
                      ? "rgba(49,230,255,0.12)"
                      : index % 2 === 0
                      ? "rgba(255,255,255,0.025)"
                      : "rgba(255,255,255,0.052)",
                  borderBottomColor: selectedId === position.id ? "rgba(49,230,255,0.28)" : C.border,
                  borderBottomWidth: index < positions.length - 1 ? 1 : 0,
                }}
              >
                {cells.map((value, cellIndex) => (
                  <View
                    key={`${position.id}-${cellIndex}`}
                    style={{ width: tableColumns[cellIndex].width, paddingHorizontal: 10, paddingVertical: 11 }}
                  >
                    <Text
                      selectable
                      numberOfLines={2}
                      style={{
                        color: cellIndex === 0 ? C.text0 : C.text1,
                        fontFamily: cellIndex === 0 || cellIndex >= 4 ? font.mono : font.regular,
                        fontSize: cellIndex === 8 ? 11 : 12,
                        lineHeight: 16,
                      }}
                    >
                      {value}
                    </Text>
                  </View>
                ))}
                <View
                  style={{
                    width: tableColumns[9].width,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    alignItems: "center",
                  }}
                >
                  <TouchableOpacity
                    onPress={(event) => {
                      event.stopPropagation();
                      onDelete(position.id);
                    }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      borderColor: "rgba(255,95,126,0.34)",
                      borderWidth: 1,
                      backgroundColor: "rgba(255,95,126,0.10)",
                    }}
                  >
                    <Trash2 size={15} color={C.red} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function StockSearchField({
  ticker,
  onSelect,
}: {
  ticker: string;
  onSelect: (data: {
    ticker: string;
    name: string;
    sector: string;
    buyPrice: string;
    currentSellPrice: string;
  }) => void;
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
    <View style={{ gap: 4, zIndex: 10 }}>
      <Text
        selectable
        style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}
      >
        Search Stock
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: "rgba(255,255,255,0.04)",
            paddingHorizontal: 12,
            height: 44,
          }}
        >
          <Search size={16} color={C.text2} style={{ marginRight: 8 }} />
          <TextInput
            value={query}
            onChangeText={handleChange}
            placeholder="Name or ticker — e.g. Infosys, AAPL"
            placeholderTextColor={C.text2}
            style={{
              flex: 1,
              color: C.text0,
              fontFamily: font.medium,
              fontSize: 13,
              paddingVertical: 0,
            }}
          />
          {searching ? <ActivityIndicator size="small" color={C.cyan} /> : null}
        </View>
      </View>

      {searchError ? (
        <Text style={{ color: C.red, fontSize: 11, marginTop: 2 }}>{searchError}</Text>
      ) : null}

      {showResults && results.length > 0 ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border2,
            backgroundColor: C.bg1,
            overflow: "hidden",
            marginTop: 4,
            elevation: 4,
          }}
        >
          {results.map((item, index) => (
            <TouchableOpacity
              key={item.ticker}
              onPress={() => void handleSelect(item)}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: index < results.length - 1 ? 1 : 0,
                borderBottomColor: C.border,
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: C.text0, fontFamily: font.medium, fontSize: 13 }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: C.text2, fontFamily: font.mono, fontSize: 10 }}>
                  {item.sector || "Unclassified"}
                </Text>
              </View>
              <Text style={{ color: C.cyan, fontFamily: font.mono, fontSize: 12 }}>{item.ticker}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function PortfolioBuilderPage({
  user,
  userData,
  portfolioSetup,
  onOpenGlossary,
  onSubmitSuccess,
}: {
  user?: UserData | null;
  userData?: UserData | null;
  portfolioSetup?: PortfolioSetup;
  onOpenGlossary?: (termKey?: string) => void;
  onSubmitSuccess?: () => void;
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 720;

  const activeUser = user ?? userData ?? null;
  const capital = Number(portfolioSetup?.totalCapital || 100000);
  const studentId = activeUser?.studentId || "student-1";

  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Load trades on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await portfolio.getTrades(studentId);
        if (res.trades && res.trades.length > 0) {
          const loaded = res.trades.map((t, idx) => tradeToPosition(t, idx, studentId));
          setPositions(loaded);
          setSelectedId(loaded[0].id);
        } else {
          // Check for draft locally
          const draft = await getPortfolioDraft(studentId);
          if (draft && draft.positions.length > 0) {
            setPositions(draft.positions);
            setSelectedId(draft.positions[0].id);
          } else {
            const initPos = [makeTrade(studentId, 0, capital)];
            setPositions(initPos);
            setSelectedId(initPos[0].id);
          }
        }
      } catch (err) {
        console.warn("Failed loading portfolio trades:", err);
        const draft = await getPortfolioDraft(studentId);
        if (draft && draft.positions.length > 0) {
          setPositions(draft.positions);
          setSelectedId(draft.positions[0].id);
        } else {
          const initPos = [makeTrade(studentId, 0, capital)];
          setPositions(initPos);
          setSelectedId(initPos[0].id);
        }
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [studentId, capital]);

  // Sync draft updates locally
  useEffect(() => {
    if (!loading && positions.length > 0) {
      void savePortfolioDraft(studentId, portfolioSetup ?? { studentId, totalCapital: String(capital), riskAppetite: "Moderate", investmentHorizon: "1 year", competitionRound: "Round 1" }, positions);
    }
  }, [positions, loading, studentId]);

  const activePosition = useMemo(
    () => positions.find((p) => p.id === selectedId) || positions[0],
    [positions, selectedId]
  );

  const updateActivePosition = (patch: Partial<Position>) => {
    if (!activePosition) return;
    setPositions((prev) =>
      prev.map((p) => (p.id === activePosition.id ? { ...p, ...patch } : p))
    );
  };

  const handleAddTrade = () => {
    const newPos = makeTrade(studentId, positions.length, capital);
    setPositions((prev) => [...prev, newPos]);
    setSelectedId(newPos.id);
  };

  const handleDeleteTrade = (id: string) => {
    if (positions.length <= 1) {
      setErrorMessage("At least one trade is required in your portfolio.");
      return;
    }
    const filtered = positions.filter((p) => p.id !== id);
    setPositions(filtered);
    if (selectedId === id) {
      setSelectedId(filtered[0]?.id || null);
    }
  };
  const handleExecuteTrade = async () => {
    if (!activePosition) return;

    if (!activePosition.stockTicker) {
      setErrorMessage("Please select or search for a valid stock ticker first.");
      return;
    }

    // §10.5 Thesis validation check
    const trimmedThesis = activePosition.thesis ? activePosition.thesis.trim() : "";
    if (trimmedThesis.length > 0 && trimmedThesis.length < 20) {
      setErrorMessage("Thesis must be at least 20 characters, or left blank.");
      return;
    }

    const buyPrice = parseFloat(activePosition.buyPrice) || 0;
    const currentSellPrice = parseFloat(activePosition.currentSellPrice) || buyPrice;
    const allocPct = Number(activePosition.allocationPercent) || 0;
    const investedAmt = (capital * allocPct) / 100;

    if (buyPrice <= 0) {
      setErrorMessage("Please enter a valid buy price before executing.");
      return;
    }

    // Round shares to whole numbers (prevent fractional truncation divergence)
    const qty = Math.max(1, Math.round(investedAmt / buyPrice));
    const actualInvestedAmt = qty * buyPrice;

    setSubmitting(true);
    setServerMessage("");
    setErrorMessage("");

    try {
      const res = await portfolio.executeTrade({
        stock_ticker: activePosition.stockTicker,
        stock_name: activePosition.stockName,
        sector: activePosition.sector,
        trade_type: activePosition.tradeType === "Sell" ? "SELL" : "BUY",
        quantity: qty,
        buy_price: buyPrice,
        current_sell_price: currentSellPrice,
        tag1: activePosition.tag1,
        tag2: activePosition.tag2,
        tag3: activePosition.tag3,
        thesis: trimmedThesis || undefined,
        amount_invested: actualInvestedAmt,
      });

      const successDetail = `${res.message || "Trade executed successfully!"} — ${qty} share${
        qty === 1 ? "" : "s"
      } at $${buyPrice.toFixed(2)} (~$${actualInvestedAmt.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} invested).`;

      setServerMessage(successDetail);

      await analytics.computeScores(studentId).catch(() => null);

      const tradesRes = await portfolio.getTrades(studentId);
      if (tradesRes.trades) {
        const loaded = tradesRes.trades.map((t, idx) => tradeToPosition(t, idx, studentId));
        setPositions(loaded);
        setSelectedId(loaded[0]?.id || null);
      }
      onSubmitSuccess?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Trade execution failed");
    } finally {
      setSubmitting(false);
    }
  };
  

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <ActivityIndicator size="large" color={C.cyan} />
        <Text style={{ color: C.text2, fontFamily: font.medium, marginTop: 12 }}>
          Loading Portfolio Builder...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: isMobile ? 16 : 28, gap: 20 }}>
      <SectionTitle title="Portfolio Builder" right={<Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 11 }}>Construct, execute, and refine your trade positions</Text>} />

      {serverMessage ? (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: "rgba(49,230,255,0.15)", borderWidth: 1, borderColor: C.cyan }}>
          <Text style={{ color: C.cyan, fontFamily: font.medium, fontSize: 13 }}>{serverMessage}</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: "rgba(255,95,126,0.15)", borderWidth: 1, borderColor: C.red }}>
          <Text style={{ color: C.red, fontFamily: font.medium, fontSize: 13 }}>{errorMessage}</Text>
        </View>
      ) : null}

      <GlassCard style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: C.text0, fontFamily: font.medium, fontSize: 16 }}>Positions Overview</Text>
          <AppButton label="+ Add Position" onPress={handleAddTrade} />
        </View>

        <DraftTradesTable
          positions={positions}
          selectedId={selectedId}
          onSelect={(p) => setSelectedId(p.id)}
          onDelete={handleDeleteTrade}
        />
      </GlassCard>

      {activePosition ? (
        <GlassCard style={{ gap: 18 }}>
          <Text style={{ color: C.cyan, fontFamily: font.medium, fontSize: 15 }}>
            Edit Position: {activePosition.stockTicker || "New Trade"}
          </Text>

          <StockSearchField
            ticker={activePosition.stockTicker}
            onSelect={(data) => {
              updateActivePosition({
                stockTicker: data.ticker,
                stockName: data.name,
                sector: data.sector,
                buyPrice: data.buyPrice,
                currentSellPrice: data.currentSellPrice,
              });
            }}
          />

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            <CompactSelect
              label="Sector"
              options={sectorOptions}
              value={activePosition.sector}
              onChange={(sector) => updateActivePosition({ sector })}
            />
            <CompactSelect
              label="Type"
              options={["Buy", "Sell"]}
              value={activePosition.tradeType}
              onChange={(tradeType) => updateActivePosition({ tradeType: tradeType as "Buy" | "Sell" })}
            />
          </View>

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            <Field
              label="Allocation (%)"
              value={String(activePosition.allocationPercent)}
              placeholder="Enter allocation percent"
              onChangeText={(val) => {
                const num = parseFloat(val) || 0;
                updateActivePosition({
                  allocationPercent: num,
                  amountInvested: money((capital * num) / 100),
                });
              }}
              keyboardType="numeric"
            />
            <Field
              label="Buy Price ($)"
              value={activePosition.buyPrice}
              placeholder="Enter buy price"
              onChangeText={(buyPrice) => updateActivePosition({ buyPrice })}
              keyboardType="numeric"
            />
            <Field
              label="Current/Target Price ($)"
              value={activePosition.currentSellPrice}
              placeholder="Enter current or target price"
              onChangeText={(currentSellPrice) => updateActivePosition({ currentSellPrice })}
              keyboardType="numeric"
            />
          </View>

          <OptionRow
            label="Primary Tag"
            options={tagOptions}
            value={activePosition.tag1}
            onChange={(tag1) => updateActivePosition({ tag1 })}
          />

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}>
                Investment Thesis
              </Text>
              <Text style={{ color: C.text2, fontFamily: font.mono, fontSize: 10 }}>
                Words: {wordCount(activePosition.thesis)}
              </Text>
            </View>
            <TextInput
              multiline
              numberOfLines={4}
              value={activePosition.thesis}
              onChangeText={(thesis) => updateActivePosition({ thesis })}
              placeholder="Explain the rationale behind this position..."
              placeholderTextColor={C.text2}
              style={{
                minHeight: 88,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: "rgba(255,255,255,0.04)",
                padding: 12,
                color: C.text0,
                fontFamily: font.regular,
                fontSize: 13,
                textAlignVertical: "top",
              }}
            />
          </View>

          <View style={{ marginTop: 8 }}>
            <AppButton
              label={submitting ? "Executing Trade..." : "Execute & Save Position"}
              onPress={() => void handleExecuteTrade()}
              disabled={submitting}
            />
          </View>
        </GlassCard>
      ) : null}
    </ScrollView>
  );
}

export { PortfolioBuilderPage as PortfolioBuilder };
