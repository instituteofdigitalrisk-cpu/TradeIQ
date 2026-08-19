import { Search, Star, TrendingDown, TrendingUp } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path, Polyline, Text as SvgText } from "react-native-svg";
import { market } from "../api";
import type { MarketIndex, MarketRow, MarketStockInfo } from "../api";
import { C, font } from "../constants";
import { GlassCard, SectionTitle } from "./ui";

const money = (value: number | null | undefined, currency = "USD") => {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${currency === "INR" ? "₹" : "$"}${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

const compact = (value: number | null | undefined) => {
  if (value == null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return Number(value).toLocaleString("en-US");
};

const indexPrice = (value: string) => {
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
};

function MarketList({ title, rows, color, onSelect }: { title: string; rows: MarketRow[]; color: string; onSelect: (row: MarketRow) => void }) {
  return (
    <GlassCard style={{ padding: 14, flex: 1, minWidth: 240 }} accent={color}>
      <SectionTitle title={title} accent={color} />
      {rows.length === 0 ? <Text style={{ color: C.text2, fontSize: 12 }}>No market data available.</Text> : rows.map((row) => (
        <TouchableOpacity key={row.ticker} onPress={() => onSelect(row)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View><Text style={{ color: C.text1, fontFamily: font.medium, fontSize: 12 }}>{row.symbol}</Text><Text style={{ color: C.text2, fontSize: 10 }}>{row.sector}</Text></View>
          <View style={{ alignItems: "flex-end" }}><Text style={{ color: C.text0, fontFamily: font.mono, fontSize: 12 }}>{money(row.price, row.ticker.endsWith(".NS") ? "INR" : "USD")}</Text><Text style={{ color: row.change_pct >= 0 ? C.green : C.red, fontFamily: font.mono, fontSize: 11 }}>{row.change_pct >= 0 ? "+" : ""}{row.change_pct.toFixed(2)}%</Text></View>
        </TouchableOpacity>
      ))}
    </GlassCard>
  );
}

function PriceChart({ points, period }: { points: { date: string; price: number }[]; period: string }) {
  const width = 640;
  const height = 220;
  if (points.length < 2) return <View style={{ height: 220, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.text2, fontSize: 12 }}>Price history unavailable.</Text></View>;
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.01, max - min);
  const toPoint = (value: number, index: number) => `${(index / (points.length - 1)) * width},${height - ((value - min) / range) * (height - 20) - 10}`;
  const polyline = points.map((point, index) => toPoint(point.price, index)).join(" ");
  const area = `M0,${height} L${points.map((point, index) => toPoint(point.price, index)).join(" L")} L${width},${height} Z`;
  const positive = values[values.length - 1] >= values[0];
  const y = (value: number) => height - ((value - min) / range) * (height - 20) - 10;
  const mid = (min + max) / 2;
  const formatAxisLabel = (date: string) => {
    const value = new Date(date);
    if (period === "1D") return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (period === "5D") return `${value.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    if (period === "1M") return value.toLocaleDateString([], { month: "short", day: "numeric" });
    if (period === "6M" || period === "YTD" || period === "1Y") return value.toLocaleDateString([], { month: "short" });
    return value.toLocaleDateString([], { year: "numeric" });
  };
  const axisPoints = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];
  return <View style={{ marginTop: 8 }}><View style={{ flexDirection: "row" }}><View style={{ width: 78, height: height + 28, position: "relative", paddingLeft: 26 }}><Text style={{ position: "absolute", left: -2, top: height / 2 - 12, color: C.text2, fontSize: 10, transform: [{ rotate: "-90deg" }] }}>Price</Text><View style={{ flex: 1, justifyContent: "space-between", paddingVertical: 4 }}><Text style={{ color: C.text2, fontSize: 10, textAlign: "right" }}>{max.toFixed(2)}</Text><Text style={{ color: C.text2, fontSize: 10, textAlign: "right" }}>{mid.toFixed(2)}</Text><Text style={{ color: C.text2, fontSize: 10, textAlign: "right" }}>{min.toFixed(2)}</Text></View></View><Svg style={{ flex: 1 }} height={height + 28} viewBox={`0 0 ${width} ${height + 28}`}><Path d={area} fill={positive ? "rgba(30,210,150,0.16)" : "rgba(255,75,105,0.16)"} /><Polyline points={polyline} fill="none" stroke={positive ? C.cyan : C.red} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /><Circle cx={width} cy={y(values[values.length - 1])} r={4} fill={positive ? C.cyan : C.red} /><SvgText x="0" y={height + 18} fill={C.text2} fontSize="11">{formatAxisLabel(axisPoints[0].date)}</SvgText><SvgText x={width / 2} y={height + 18} fill={C.text2} fontSize="11" textAnchor="middle">{formatAxisLabel(axisPoints[1].date)}</SvgText><SvgText x={width} y={height + 18} fill={C.text2} fontSize="11" textAnchor="end">{formatAxisLabel(axisPoints[2].date)}</SvgText></Svg></View><View style={{ flexDirection: "row", marginLeft: 78, marginTop: 2 }}><Text style={{ flex: 1, color: C.text2, fontSize: 10, textAlign: "center" }}>{period === "1D" || period === "5D" ? "Time" : "Date"}</Text></View></View>;
}

export function MarketTab({ indices, onSelectTicker }: { indices: MarketIndex[]; onSelectTicker?: (ticker: string) => void }) {
  const [query, setQuery] = useState("");
  const [overview, setOverview] = useState<{ gainers: MarketRow[]; losers: MarketRow[]; active: MarketRow[]; sectors: { sector: string; change_pct: number }[] } | null>(null);
  const [selected, setSelected] = useState<MarketStockInfo | null>(null);
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [period, setPeriod] = useState("1M");
  const [history, setHistory] = useState<{ date: string; price: number }[]>([]);
  const [searchResults, setSearchResults] = useState<{ ticker: string; name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { market.getOverview().then(setOverview).catch(() => setOverview(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!selectedTicker) return; market.getStockInfo(selectedTicker).then(setSelected).catch(() => setSelected(null)); }, [selectedTicker]);
  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    if (period === "1D") start.setDate(start.getDate() - 2);
    else if (period === "5D") start.setDate(start.getDate() - 7);
    else if (period === "1M") start.setMonth(start.getMonth() - 1);
    else if (period === "6M") start.setMonth(start.getMonth() - 6);
    else if (period === "YTD") start.setMonth(0, 1);
    else if (period === "1Y") start.setFullYear(start.getFullYear() - 1);
    else if (period === "5Y") start.setFullYear(start.getFullYear() - 5);
    else start.setFullYear(start.getFullYear() - 20);
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    market.getHistory(selectedTicker, iso(start), iso(end)).then((data) => setHistory(data.history.map((row) => ({ date: row.Date, price: Number(row.Close) })))).catch(() => setHistory([]));
  }, [selectedTicker, period]);
  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => { market.search(query).then((data) => setSearchResults(data.results)).catch(() => setSearchResults([])); }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const selectedRow = useMemo(() => [...(overview?.gainers || []), ...(overview?.losers || []), ...(overview?.active || [])].find((row) => row.ticker === selectedTicker || row.symbol === selectedTicker), [overview, selectedTicker]);
  const select = (row: MarketRow) => { setSelectedTicker(row.ticker); onSelectTicker?.(row.ticker); };

  return <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
    <GlassCard style={{ padding: 14 }} accent={C.cyan}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingHorizontal: 10 }}>
        <Search size={16} color={C.text2} /><TextInput value={query} onChangeText={setQuery} placeholder="Search stocks, companies, or indices" placeholderTextColor={C.text2} style={{ flex: 1, color: C.text0, fontFamily: font.regular, paddingVertical: 11, fontSize: 12 }} />
      </View>
      {searchResults.length > 0 ? <View style={{ marginTop: 8, gap: 4 }}>{searchResults.map((result) => <TouchableOpacity key={result.ticker} onPress={() => { setSelectedTicker(result.ticker); setQuery(""); setSearchResults([]); }}><Text style={{ color: C.cyan, fontSize: 12 }}>{result.ticker} · {result.name || "Unknown company"}</Text></TouchableOpacity>)}</View> : null}
    </GlassCard>

    <GlassCard style={{ padding: 14 }} accent={C.cyan}><SectionTitle title="Market Overview" accent={C.cyan} /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{indices.filter((item) => item.ticker.startsWith("^")).map((item) => <View key={item.ticker} style={{ flex: 1, minWidth: 130, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 11 }}><Text style={{ color: C.text2, fontSize: 11 }}>{item.name}</Text><Text style={{ color: C.text0, fontFamily: font.mono, fontSize: 18, marginTop: 5 }}>{indexPrice(item.price)}</Text><Text style={{ color: item.up ? C.green : C.red, fontFamily: font.mono, fontSize: 11 }}>{item.change}</Text></View>)}</View></GlassCard>

    {loading ? <ActivityIndicator color={C.cyan} /> : null}

    <View style={{ flexDirection: "column", gap: 12 }}>
      <GlassCard style={{ padding: 14, flex: 1, minWidth: 260 }} accent={C.cyan}><SectionTitle title="Selected Stock" accent={C.cyan} /><Text style={{ color: C.text0, fontFamily: font.medium, fontSize: 17 }}>{selected?.company_name || selectedTicker} ({selectedTicker})</Text><Text style={{ color: C.text2, fontSize: 12, marginTop: 4 }}>{selected?.exchange || "—"} · {selected?.sector || "—"}</Text><Text style={{ color: C.cyan, fontFamily: font.mono, fontSize: 25, marginTop: 12 }}>{selectedRow ? money(selectedRow.price, selectedRow.ticker.endsWith(".NS") ? "INR" : "USD") : "—"}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 12 }}>{["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"].map((value) => <TouchableOpacity key={value} onPress={() => setPeriod(value)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, backgroundColor: period === value ? C.cyan : "rgba(255,255,255,0.05)" }}><Text style={{ color: period === value ? C.bg0 : C.text1, fontSize: 10, fontFamily: font.medium }}>{value}</Text></TouchableOpacity>)}</View><PriceChart points={history} period={period} /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>{[["Open", selected?.open], ["Prev Close", selected?.previous_close], ["Day High", selected?.day_high], ["Day Low", selected?.day_low], ["Volume", selected?.volume ? compact(selected.volume) : null], ["Market Cap", compact(selected?.market_cap)], ["P/E", selected?.pe_ratio], ["52W High", selected?.week52_high], ["52W Low", selected?.week52_low]].map(([label, value]) => <View key={String(label)} style={{ minWidth: 100 }}><Text style={{ color: C.text2, fontSize: 10 }}>{label}</Text><Text style={{ color: C.text1, fontFamily: font.mono, fontSize: 12, marginTop: 3 }}>{typeof value === "number" ? value.toFixed(2) : value || "—"}</Text></View>)}</View></GlassCard></View>

    {loading ? null : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}><MarketList title="Top Gainers" rows={overview?.gainers || []} color={C.green} onSelect={select} /><MarketList title="Top Losers" rows={overview?.losers || []} color={C.red} onSelect={select} /><MarketList title="Most Active" rows={overview?.active || []} color={C.gold} onSelect={select} /></View>}

    <GlassCard style={{ padding: 14 }} accent={C.gold}><SectionTitle title="Company Information" accent={C.gold} /><Text style={{ color: C.text1, fontSize: 12, lineHeight: 18 }}>{selected?.description || "Select a stock to view company information from Yahoo Finance."}</Text><TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}><Star size={15} color={C.gold} /><Text style={{ color: C.gold, fontSize: 12 }}>Add to Watchlist</Text></TouchableOpacity></GlassCard>
  </ScrollView>;
}
