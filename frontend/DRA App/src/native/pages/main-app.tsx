import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { BarChart3, Bell, BookOpen, BriefcaseBusiness, LayoutDashboard, LogOut, Trophy, UserRound } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import type { ScrollView as ScrollViewType } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { clearActiveUser } from "../auth-store";
import { clearMarketCache } from "../market-store";
import { analytics, portfolio } from "../api";
import type { BackendWeeklyScore, PortfolioSummary } from "../api";
import { brandIcon, C, font, tradeIqLogo } from "../constants";
import type { IconType, MainTab, UserData } from "../types";
import { MarketTicker } from "../components/market-ticker";
import { GlassCard, SectionTitle } from "../components/ui";
import { Courses } from "./courses";
import { Dashboard } from "./dashboard";
import { Leaderboard } from "./leaderboard";
import { PortfolioBuilder } from "./portfolio-builder";
import { Scores } from "./scores";

const navItems: { id: MainTab; label: string; Icon: IconType }[] = [
  { id: "dashboard", label: "Home", Icon: LayoutDashboard },
  { id: "portfolio", label: "Portfolio", Icon: BriefcaseBusiness },
  { id: "scores", label: "Scores", Icon: BarChart3 },
  { id: "leaderboard", label: "Ranks", Icon: Trophy },
  { id: "courses", label: "Courses", Icon: BookOpen },
];

function money(value: number) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProfileStat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 138,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: `${color}66`,
        backgroundColor: `${color}18`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 24px ${color}12`,
      }}
    >
      <Text selectable style={{ color: C.text2, fontFamily: font.medium, fontSize: 10, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text selectable adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.72} style={{ color, fontFamily: font.mono, fontSize: 18, marginTop: 6 }}>
        {value}
      </Text>
      <Text selectable numberOfLines={1} style={{ color: C.text1, fontSize: 11, marginTop: 4 }}>
        {sub}
      </Text>
    </View>
  );
}

export function MainApp({ userData, onLogout }: { userData: UserData | null; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [portfolioScore, setPortfolioScore] = useState<number | null>(null);
  const [profileSummary, setProfileSummary] = useState<PortfolioSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width > 780;
  const isCompact = width < 390;
  const userName = userData?.fullName || "Student Analyst";
  const studentId = userData?.studentId || "202600000000";
  const initials = useMemo(() => userName.split(" ").map((item) => item[0]).join("").slice(0, 2).toUpperCase(), [userName]);
  const bottomNavHeight = (isCompact ? 84 : 92) + insets.bottom;
  const scrollRef = useRef<ScrollViewType>(null);

  // New States and Handler to satisfy CoursesProps requirements
  const [courses, setCourses] = useState<any[]>([]); 
  const [progress, setProgress] = useState<any[]>([]);

  const handleProgressUpdated = (courseId: any, updatedData: any) => {
    // Implement state persistence updates here if needed
    console.log(`Course ${courseId} progress updated to:`, updatedData);
  };

  useEffect(() => {
    if (!profileOpen) {
      setPortfolioScore(null);
      setProfileSummary(null);
    }
  }, [profileOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    setProfileLoading(true);
    Promise.all([
      portfolio.getSummary(studentId).catch(() => null),
      analytics
        .getScores(studentId)
        .then((data) => {
          if (data.scores.length === 0) return 0;
          const latest = data.scores.reduce((max: BackendWeeklyScore, s: BackendWeeklyScore) =>
            s.week_number > max.week_number ? s : max
          );
          return Math.round(latest.final_score);
        })
        .catch(() => 0),
    ])
      .then(([summary, score]) => {
        setProfileSummary(summary);
        setPortfolioScore(score);
      })
      .finally(() => setProfileLoading(false));
  }, [profileOpen, studentId]);

  const profileReturn = profileSummary
    ? `${profileSummary.total_return_pct >= 0 ? "+" : ""}${profileSummary.total_return_pct.toFixed(1)}%`
    : "...";
  const profileReturnColor = profileSummary && profileSummary.total_return_pct < 0 ? C.red : C.green;
  const profilePnl = profileSummary
    ? `${profileSummary.total_pnl >= 0 ? "+" : ""}${money(profileSummary.total_pnl)} P&L`
    : profileLoading ? "Loading..." : "No portfolio data";
  const profileBase = profileSummary ? `vs ${money(profileSummary.total_capital)} base` : "Portfolio base";
  const profilePanelWidth = Math.min(width - 36, isWide ? 420 : 360);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
      <MarketTicker />
      <View style={{ zIndex: 2, paddingHorizontal: 18, paddingVertical: 12, borderBottomColor: "rgba(49,230,255,0.24)", borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(5,8,18,0.86)", boxShadow: "0 10px 28px rgba(49,230,255,0.10)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <Image source={brandIcon} contentFit="cover" style={{ width: isCompact ? 30 : 34, height: isCompact ? 30 : 34, borderRadius: 8 }} />
          <Image source={tradeIqLogo} contentFit="contain" style={{ width: isCompact ? 116 : 138, height: 36 }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <TouchableOpacity onPress={() => setProfileOpen(true)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.cyan, alignItems: "center", justifyContent: "center" }}>
            <Text selectable style={{ color: C.ink, fontFamily: font.medium, fontSize: 13 }}>
              {initials}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1 }}
        scrollIndicatorInsets={{ bottom: bottomNavHeight }}
        contentContainerStyle={{ padding: isWide ? 28 : 18, paddingBottom: bottomNavHeight + 56, maxWidth: 980, width: "100%", alignSelf: "center" }}
      >
        {activeTab === "dashboard" ? <Dashboard userName={userName} studentId={studentId} /> : null}
        {activeTab === "portfolio" ? <PortfolioBuilder userData={userData} onSubmitSuccess={() => setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 150)} /> : null}
        {activeTab === "scores" ? <Scores studentId={studentId} /> : null}
        {activeTab === "leaderboard" ? <Leaderboard studentId={studentId} /> : null}
        {activeTab === "courses" ? (
          <Courses 
            user={userData}
            courses={courses}
            progress={progress}
            onProgressUpdated={handleProgressUpdated}
          />
        ) : null}
      </ScrollView>

      <BlurView intensity={58} tint="dark" style={{ position: "absolute", left: 0, right: 0, bottom: 0, minHeight: bottomNavHeight, borderTopColor: C.border2, borderTopWidth: 1, zIndex: 5, backgroundColor: "rgba(5,8,18,0.96)" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingBottom: insets.bottom + 10, paddingHorizontal: isCompact ? 4 : 8 }}>
          {navItems.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setActiveTab(id)}
                style={{ flex: 1, alignItems: "center", gap: 4, minWidth: 0, paddingVertical: isCompact ? 6 : 7, borderRadius: 14, backgroundColor: active ? "rgba(49,230,255,0.14)" : "transparent" }}
              >
                <Icon size={isCompact ? 20 : 22} color={active ? C.cyan : C.text2} strokeWidth={active ? 2.6 : 2} />
                <Text selectable numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: active ? C.cyan : C.text2, fontFamily: font.medium, fontSize: isCompact ? 10 : 11, textAlign: "center", width: "100%" }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>

      <Modal transparent animationType="fade" visible={profileOpen} onRequestClose={() => setProfileOpen(false)}>
  <Pressable onPress={() => setProfileOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-start", alignItems: isWide ? "flex-end" : "center", padding: 18, paddingTop: 84 }}>
    <Pressable onPress={(event) => event.stopPropagation()}>
    <GlassCard style={{ width: profilePanelWidth, padding: 16, gap: 14, backgroundColor: C.bg1, borderColor: "rgba(49,230,255,0.30)" }} accent={C.cyan}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: C.cyan, alignItems: "center", justifyContent: "center" }}>
          <UserRound size={25} color={C.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text selectable style={{ color: C.text0, fontFamily: font.medium, fontSize: 15 }}>
            {userName}
          </Text>
          <Text selectable style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>
            User ID: {studentId}
          </Text>
        </View>
      </View>
      <Text selectable style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>
        IB Sales & Trading Risk Challenge
      </Text>
      <View style={{ paddingTop: 2 }}>
        <SectionTitle title="Portfolio Stats" accent={C.cyan} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <ProfileStat label="Portfolio Value" value={profileSummary ? money(profileSummary.total_portfolio) : "..."} sub={profilePnl} color={C.green} />
        <ProfileStat label="Available Cash" value={profileSummary ? money(profileSummary.cash_balance) : "..."} sub="ready to deploy" color={C.gold} />
        <ProfileStat label="Portfolio Return" value={profileReturn} sub={profileBase} color={profileReturnColor} />
        <ProfileStat label="Weekly Performance" value={profileLoading ? "..." : `${portfolioScore ?? 0}/100`} sub="scorecard" color={C.purple} />
      </View>
      <TouchableOpacity
        onPress={() => {
          clearMarketCache();
          clearActiveUser();
          setProfileOpen(false);
          onLogout();
        }}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,95,126,0.10)", borderColor: "rgba(255,95,126,0.26)", borderWidth: 1 }}
      >
        <LogOut size={17} color={C.red} />
        <Text selectable style={{ color: C.red, fontFamily: font.medium, fontSize: 13 }}>
          Logout
        </Text>
      </TouchableOpacity>
    </GlassCard>
    </Pressable>
  </Pressable>
</Modal>
    </SafeAreaView>
  );
}