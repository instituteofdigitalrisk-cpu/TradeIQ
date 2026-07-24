import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { C, font } from "../constants";
import { analytics } from "../api";
import type { BackendLeaderboardEntry } from "../api";
import { GlassCard, SectionTitle } from "../components/ui";

const PAGE_SIZE = 10;

function StatCard({
  label, value, sub, color = C.cyan,
}: {
  label: string; value: string; sub: string; color?: string;
}) {
  return (
    <GlassCard style={{ flex: 1, minWidth: 150, padding: 14 }} accent={color}>
      <SectionTitle title={label} accent={color} />
      <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 24, marginTop: 5 }}>
        {value}
      </Text>
      <Text selectable style={{ color, fontFamily: font.regular, fontSize: 11, marginTop: 4 }}>
        {sub}
      </Text>
    </GlassCard>
  );
}

// Medal color for top 3, fallback for the rest
function rankColor(rank: number): string {
  if (rank === 1) return C.gold;
  if (rank === 2) return "#cfd6e6";
  if (rank === 3) return "#cd7f32";
  return C.text2;
}

export function Leaderboard({ studentId }: { studentId?: string }) {
  const [entries, setEntries] = useState<BackendLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
    analytics
      .getLeaderboard()
      .then((res) => setEntries(res.entries ?? []))
      .catch(() => {
        setError(true);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const topScore = entries[0]?.final_score ?? 0;
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const visibleEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const pageFrom = entries.length === 0 ? 0 : pageStart + 1;
  const pageTo = Math.min(pageStart + PAGE_SIZE, entries.length);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  return (
    <View style={{ gap: 16 }}>
      {/* Header */}
      <View>
        <Text selectable style={{ color: C.text0, fontFamily: font.heading, fontSize: 29, textTransform: "uppercase" }}>
          Leaderboard
        </Text>
        <Text selectable style={{ color: C.text2, fontSize: 13, marginTop: 4 }}>
          Weekly ranking blends performance, thesis quality, and risk governance.
        </Text>
      </View>

      {/* Summary stat cards */}
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        {/* Prize Pool card */}
        <GlassCard style={{ flex: 1, minWidth: 150, padding: 14 }} accent={C.gold}>
          <SectionTitle title="Prize Pool" accent={C.gold} />
          <View style={{ marginTop: 6, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text selectable style={{ color: C.gold, fontFamily: font.mono, fontSize: 13 }}>🥇</Text>
              <Text selectable style={{ color: C.text2, fontFamily: font.regular, fontSize: 11, flex: 1 }}>Champion</Text>
              <Text selectable style={{ color: C.gold, fontFamily: font.mono, fontSize: 13, fontWeight: "700" }}>$1,000</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text selectable style={{ color: "#cfd6e6", fontFamily: font.mono, fontSize: 13 }}>🥈</Text>
              <Text selectable style={{ color: C.text2, fontFamily: font.regular, fontSize: 11, flex: 1 }}>1st Runner Up</Text>
              <Text selectable style={{ color: "#cfd6e6", fontFamily: font.mono, fontSize: 13, fontWeight: "700" }}>$500</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text selectable style={{ color: "#cd7f32", fontFamily: font.mono, fontSize: 13 }}>🥉</Text>
              <Text selectable style={{ color: C.text2, fontFamily: font.regular, fontSize: 11, flex: 1 }}>2nd Runner Up</Text>
              <Text selectable style={{ color: "#cd7f32", fontFamily: font.mono, fontSize: 13, fontWeight: "700" }}>$250</Text>
            </View>
          </View>
        </GlassCard>

        <StatCard label="Participants" value={loading ? "…" : String(entries.length)} sub="registered" color={C.cyan} />

        {/* My Rank card */}
        <GlassCard style={{ flex: 1, minWidth: 150, padding: 14 }} accent={C.green}>
          <SectionTitle title="My Rank" accent={C.green} />
          {loading ? (
            <ActivityIndicator color={C.green} style={{ marginTop: 8 }} />
          ) : (() => {
            const myEntry = studentId ? entries.find((e) => e.user_id === studentId) : undefined;
            const myRank = myEntry?.rank_position
              ?? (studentId ? entries.findIndex((e) => e.user_id === studentId) + 1 : 0);
            return myEntry ? (
              <>
                <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 24, marginTop: 5 }}>
                  #{myRank}
                </Text>
                <Text selectable style={{ color: C.green, fontFamily: font.regular, fontSize: 11, marginTop: 4 }}>
                  of {entries.length} participants
                </Text>
              </>
            ) : (
              <>
                <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 24, marginTop: 5 }}>—</Text>
                <Text selectable style={{ color: C.text2, fontFamily: font.regular, fontSize: 11, marginTop: 4 }}>not ranked yet</Text>
              </>
            );
          })()}
        </GlassCard>
      </View>



      {/* Rankings table */}
      <GlassCard style={{ padding: 12, gap: 2 }} accent={C.gold}>
        <SectionTitle
          title="Rankings"
          accent={C.gold}
          right={
            <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 11 }}>
              {loading ? "" : `${entries.length} competitors`}
            </Text>
          }
        />

        {loading ? (
          <ActivityIndicator color={C.cyan} style={{ marginTop: 12 }} />
        ) : error ? (
          <Text selectable style={{ color: C.red, fontSize: 13, padding: 8 }}>
            Could not load rankings. Please refresh after signing in again.
          </Text>
        ) : entries.length === 0 ? (
          <Text selectable style={{ color: C.text2, fontSize: 13, padding: 8 }}>
            No entries yet. Rankings appear after the first scoring run.
          </Text>
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false}>
              {visibleEntries.map((entry, index) => {
                const absoluteIndex = pageStart + index;
                const rank = entry.rank_position ?? absoluteIndex + 1;
                const isMe = studentId && entry.user_id === studentId;
                const color = rankColor(rank);

                return (
                  <View
                    key={entry.user_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderRadius: 12,
                      marginVertical: 2,
                      backgroundColor: isMe
                        ? "rgba(49,230,255,0.08)"
                        : index % 2 === 0
                          ? "rgba(255,255,255,0.025)"
                          : "transparent",
                      borderWidth: isMe ? 1 : 0,
                      borderColor: isMe ? "rgba(49,230,255,0.30)" : "transparent",
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: rank <= 3 ? `${color}22` : "transparent",
                        borderWidth: rank <= 3 ? 1 : 0,
                        borderColor: `${color}55`,
                      }}
                    >
                      <Text selectable style={{ color, fontFamily: font.mono, fontSize: 13, fontWeight: "700" }}>
                        #{rank}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text selectable style={{ color: isMe ? C.cyan : C.text0, fontFamily: font.medium, fontSize: 14 }}>
                          {entry.full_name ?? entry.user_id}
                        </Text>
                        {isMe && (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "rgba(49,230,255,0.15)", borderColor: "rgba(49,230,255,0.35)", borderWidth: 1 }}>
                            <Text selectable style={{ color: C.cyan, fontSize: 9, fontFamily: font.medium }}>YOU</Text>
                          </View>
                        )}
                      </View>
                      <Text selectable style={{ color: C.text2, fontSize: 11, marginTop: 1 }}>
                        {entry.university ?? "—"}
                        {entry.team_name ? `  ·  ${entry.team_name}` : ""}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text selectable style={{ color: C.text0, fontFamily: font.mono, fontSize: 16, fontWeight: "700" }}>
                        {(entry.final_score ?? 0).toFixed(1)}
                        <Text style={{ color: C.text2, fontSize: 10 }}>/100</Text>
                      </Text>
                      {entry.portfolio_value != null && (
                        <Text selectable style={{ color: C.green, fontFamily: font.mono, fontSize: 11 }}>
                          ${entry.portfolio_value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 12, borderTopColor: C.border, borderTopWidth: 1, marginTop: 8 }}>
              <TouchableOpacity
                disabled={page === 0}
                onPress={() => setPage((current) => Math.max(0, current - 1))}
                style={{
                  minWidth: 88,
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: page === 0 ? C.border : "rgba(255,209,102,0.45)",
                  backgroundColor: page === 0 ? "rgba(255,255,255,0.035)" : "rgba(255,209,102,0.10)",
                  opacity: page === 0 ? 0.55 : 1,
                }}
              >
                <Text selectable style={{ color: page === 0 ? C.text2 : C.gold, fontFamily: font.medium, fontSize: 12 }}>
                  Previous
                </Text>
              </TouchableOpacity>

              <View style={{ flex: 1, alignItems: "center" }}>
                <Text selectable style={{ color: C.text1, fontFamily: font.medium, fontSize: 12 }}>
                  Page {page + 1} of {totalPages}
                </Text>
                <Text selectable style={{ color: C.text2, fontFamily: font.mono, fontSize: 10, marginTop: 2 }}>
                  Showing {pageFrom}-{pageTo} of {entries.length}
                </Text>
              </View>

              <TouchableOpacity
                disabled={page >= totalPages - 1}
                onPress={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                style={{
                  minWidth: 88,
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: page >= totalPages - 1 ? C.border : "rgba(255,209,102,0.45)",
                  backgroundColor: page >= totalPages - 1 ? "rgba(255,255,255,0.035)" : "rgba(255,209,102,0.10)",
                  opacity: page >= totalPages - 1 ? 0.55 : 1,
                }}
              >
                <Text selectable style={{ color: page >= totalPages - 1 ? C.text2 : C.gold, fontFamily: font.medium, fontSize: 12 }}>
                  Next
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </GlassCard>
    </View>
  );
}