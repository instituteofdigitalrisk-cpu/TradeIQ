import { Check, Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { C, font, glossary, glossaryTerms, sectorOptions } from "../constants";
import { getPortfolioDraft, savePortfolioDraft } from "../portfolio-store";
import { market, portfolio } from "../api";
import type { StockSearchResult } from "../api";
import type { Position, PortfolioSetup, UserData } from "../types";
import { wordCount } from "../utils";
import { AppButton, Field, GlassCard, Pill, SectionTitle } from "../components/ui";

const totalCapital = 10000;
const tagOptions = ["Earnings Play", "Macro Tailwind", "Valuation Gap", "Momentum", "Risk Hedge", "(optional)"];

function today() {
  return new Date().toLocaleDateString("en-GB");
}

function makeTrade(studentId: string, index: number): Position {
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
    amountInvested: "$1,000",
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    setQuery(text.toUpperCase());
    setShowResults(false);
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
      } catch {
        setResults([]);
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

export function PortfolioBuilder({ userData }: { userData: UserData | null }) {
  const studentId = userData?.studentId || "202600000000";
  const { width } = useWindowDimensions();
  const isNarrow = width < 430;
  const [positions, setPositions] = useState<Position[]>([makeTrade(studentId, 0)]);
  const [setup, setSetup] = useState<PortfolioSetup>({
    studentId,
    totalCapital: "$10,000",
    riskAppetite: "Moderate",
    investmentHorizon: "1 Month",
    competitionRound: "June 2026",
  });
  const [activeGlossary, setActiveGlossary] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");

  useEffect(() => {
    let active = true;
    setDraftStatus("Loading saved portfolio...");
    getPortfolioDraft(studentId).then((draft) => {
      if (!active) return;
      if (draft) {
        setSetup(draft.setup);
        setPositions(draft.positions.length ? draft.positions : [makeTrade(studentId, 0)]);
        setDraftStatus(`Draft restored from ${new Date(draft.updatedAt).toLocaleString()}.`);
      } else {
        setSetup({
          studentId,
          totalCapital: "$10,000",
          riskAppetite: "Moderate",
          investmentHorizon: "1 Month",
          competitionRound: "June 2026",
        });
        setPositions([makeTrade(studentId, 0)]);
        setDraftStatus("");
      }
    });
    return () => {
      active = false;
    };
  }, [studentId]);

  const totalAllocation = positions.reduce((sum, position) => sum + (Number(position.allocationPercent) || 0), 0);
  const uniqueSectors = new Set(positions.map((position) => position.sector).filter(Boolean)).size;
  const overLimit = totalAllocation > 100;
  const meetsMin = uniqueSectors >= 3 && positions.every((position) => position.allocationPercent <= 30);
  const colors = [C.purple, C.cyan, C.green, C.gold, C.red, C.text2];

  const updatePosition = (id: string, field: keyof Position, value: string | number) => {
    setPositions((prev) =>
      prev.map((position) => {
        if (position.id !== id) return position;
        const next = { ...position, [field]: value };
        if (field === "allocationPercent") next.amountInvested = `$${Math.round((totalCapital * Number(value || 0)) / 100).toLocaleString()}`;
        return next;
      }),
    );
  };

  const addPosition = () => setPositions((prev) => [...prev, makeTrade(studentId, prev.length)]);
  const removePosition = (id: string) => setPositions((prev) => prev.filter((position) => position.id !== id));

  const saveDraft = async (message = "Draft saved. Your portfolio will be restored when you sign in again.") => {
    const draft = await savePortfolioDraft(studentId, setup, positions);
    setSetup(draft.setup);
    setPositions(draft.positions);
    setDraftStatus(message);
  };

  async function submitToBackend() {
    if (!userData?.studentId) {
      setDraftStatus("Not logged in.");
      return;
    }
    setDraftStatus("Submitting trades to server...");
    let successCount = 0;
    try {
      for (const position of positions) {
        const rawPrice = parseFloat(position.buyPrice.replace(/[^0-9.]/g, ""));
        const rawAmount = parseFloat(position.amountInvested.replace(/[^0-9.]/g, ""));
        const quantity =
          rawPrice > 0 && rawAmount > 0 ? Math.max(1, Math.round(rawAmount / rawPrice)) : 1;

        await portfolio.executeTrade({
          stock_ticker: position.stockTicker,
          trade_type: position.tradeType === "Buy" ? "BUY" : "SELL",
          quantity,
          tag1: position.tag1 === "(optional)" ? undefined : position.tag1 || undefined,
          tag2: position.tag2 === "(optional)" ? undefined : position.tag2 || undefined,
          tag3: position.tag3 === "(optional)" ? undefined : position.tag3 || undefined,
          thesis: position.thesis || undefined,
        });
        successCount++;
      }
      setDraftStatus(`${successCount}/${positions.length} trade(s) submitted successfully.`);
    } catch (err) {
      setDraftStatus(
        `${successCount}/${positions.length} submitted. Error: ${err instanceof Error ? err.message : "Submission failed"}`
      );
    }
  }

  const statusText = useMemo(() => {
    if (overLimit) return "Total allocation exceeds 100%. Reduce position weights.";
    if (!meetsMin) return `Need min 3 sectors and max 30% per asset. Currently ${uniqueSectors} sectors.`;
    return "Meets diversification requirements.";
  }, [meetsMin, overLimit, uniqueSectors]);

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
        <Text selectable style={{ color: C.text0, fontFamily: font.medium, fontSize: 25 }}>
          Portfolio Setup
        </Text>
      </View>

      <GlassCard style={{ padding: 16, gap: 14, backgroundColor: "rgba(21,18,47,0.92)", borderColor: "rgba(141,124,255,0.30)" }} accent={C.purple}>
        <SectionTitle title="Portfolio Setup" accent={C.purple} />
        <Field label="User ID" value={setup.studentId} onChangeText={() => undefined} placeholder="202600000001" />
        <Field label="Total Capital" value={setup.totalCapital} onChangeText={() => undefined} placeholder="$10,000" />
        <OptionRow label="Risk Appetite" options={["High", "Moderate", "Low"]} value={setup.riskAppetite} onChange={(value) => setSetup((prev) => ({ ...prev, riskAppetite: value as PortfolioSetup["riskAppetite"] }))} />
        <OptionRow label="Investment Horizon" options={["1 Month", "2 Months", "3 Months"]} value={setup.investmentHorizon} onChange={(value) => setSetup((prev) => ({ ...prev, investmentHorizon: value }))} />
        <Field label="Competition Round" value={setup.competitionRound} onChangeText={(value) => setSetup((prev) => ({ ...prev, competitionRound: value }))} placeholder="June 2026" />
      </GlassCard>

      <GlassCard style={{ padding: 16, gap: 14, backgroundColor: "rgba(8,35,33,0.82)", borderColor: overLimit ? "rgba(255,95,126,0.34)" : "rgba(30,230,163,0.30)" }} accent={overLimit ? C.red : C.green}>
        <SectionTitle title="Allocation" accent={overLimit ? C.red : C.green} right={<Text selectable style={{ color: overLimit ? C.red : C.green, fontFamily: font.mono, fontSize: 16 }}>{totalAllocation}%</Text>} />
        <Text selectable style={{ color: C.text2, fontSize: 12, lineHeight: 17 }}>
          Keep total allocation within 100%, use at least 3 sectors, and cap each asset at 30%.
        </Text>
        <View style={{ flexDirection: "row", height: 14, borderRadius: 14, overflow: "hidden", gap: 2 }}>
          {positions.map((position, index) => (
            <View key={position.id} style={{ width: `${Math.min(position.allocationPercent, 30)}%`, minWidth: position.allocationPercent > 0 ? 2 : 0, backgroundColor: colors[index % colors.length] }} />
          ))}
        </View>
        <Text selectable style={{ color: meetsMin && !overLimit ? C.green : C.red, fontFamily: font.medium, fontSize: 12 }}>
          {statusText}
        </Text>
      </GlassCard>

      <GlassCard style={{ padding: 16, gap: 12, backgroundColor: "rgba(10,16,32,0.94)", borderColor: "rgba(49,230,255,0.24)" }} accent={C.cyan}>
        <SectionTitle
          title="Trade Log"
          accent={C.cyan}
          right={<TouchableOpacity onPress={addPosition} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(49,230,255,0.12)", borderColor: "rgba(49,230,255,0.28)", borderWidth: 1 }}>
            <Plus size={14} color={C.cyan} />
            <Text selectable style={{ color: C.cyan, fontFamily: font.medium, fontSize: 12 }}>Add</Text>
          </TouchableOpacity>}
        />
        {positions.map((position, index) => (
          <View key={position.id} style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.045)", borderColor: C.border, borderWidth: 1, borderTopWidth: 3, borderTopColor: colors[index % colors.length] }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Trade ID" value={position.tradeId} onChangeText={() => undefined} placeholder="TRD000001" />
              </View>
              <TouchableOpacity onPress={() => removePosition(position.id)} style={{ width: 42, alignSelf: "flex-end", height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", borderColor: C.border, borderWidth: 1 }}>
                <X size={16} color={C.text2} />
              </TouchableOpacity>
            </View>
            <Field label="User ID" value={position.studentId} onChangeText={() => undefined} placeholder="202600000001" />
            <Field label="Added By" value={position.addedBy} onChangeText={(value) => updatePosition(position.id, "addedBy", value.toUpperCase())} placeholder="202600000002" />
            <Field label="Trade Date" value={position.tradeDate} onChangeText={(value) => updatePosition(position.id, "tradeDate", value)} placeholder="01/06/2026" />
            <StockSearchField
              ticker={position.stockTicker}
              onSelect={(data) => {
                setPositions((prev) =>
                  prev.map((p) =>
                    p.id === position.id
                      ? {
                          ...p,
                          stockTicker: data.ticker,
                          stockName: data.name,
                          sector: data.sector,
                          buyPrice: data.buyPrice,
                          currentSellPrice: data.currentSellPrice,
                        }
                      : p,
                  ),
                );
              }}
            />
            <Field label="Stock Name" value={position.stockName} onChangeText={(value) => updatePosition(position.id, "stockName", value)} placeholder="Apple Inc" />
            <OptionRow label="Sector" options={sectorOptions} value={position.sector} onChange={(value) => updatePosition(position.id, "sector", value)} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Allocation %" value={String(position.allocationPercent)} onChangeText={(value) => updatePosition(position.id, "allocationPercent", Number(value.replace(/\D/g, "").slice(0, 3)) || 0)} placeholder="20" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Amount Invested" value={position.amountInvested} onChangeText={(value) => updatePosition(position.id, "amountInvested", value)} placeholder="$2,000" />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Buy Price" value={position.buyPrice} onChangeText={(value) => updatePosition(position.id, "buyPrice", value)} placeholder="$189.50" keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Current / Sell Price" value={position.currentSellPrice} onChangeText={(value) => updatePosition(position.id, "currentSellPrice", value)} placeholder="$201.00" keyboardType="decimal-pad" />
              </View>
            </View>
            <OptionRow label="Trade Type" options={["Buy", "Sell"]} value={position.tradeType} onChange={(value) => updatePosition(position.id, "tradeType", value)} />
            <OptionRow label="Tag 1" options={tagOptions} value={position.tag1} onChange={(value) => updatePosition(position.id, "tag1", value)} />
            <OptionRow label="Tag 2" options={tagOptions} value={position.tag2} onChange={(value) => updatePosition(position.id, "tag2", value)} />
            <OptionRow label="Tag 3" options={tagOptions} value={position.tag3} onChange={(value) => updatePosition(position.id, "tag3", value)} />
            <Field label="Thesis" value={position.thesis} onChangeText={(value) => updatePosition(position.id, "thesis", value)} placeholder="Max 50 words" multiline />
            <Text selectable style={{ color: wordCount(position.thesis) <= 50 ? C.text2 : C.red, fontSize: 10, alignSelf: "flex-end" }}>
              {wordCount(position.thesis)}/50 words
            </Text>
          </View>
        ))}
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
        <View style={{ flex: 1 }}>
          <AppButton label="Save Draft" onPress={() => void saveDraft()} variant="ghost" />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton label="Submit" onPress={() => {
            void submitToBackend();
            setSubmitted(true);
          }} disabled={overLimit} />
        </View>
      </View>
    </View>
  );
}
