import type React from "react";

export type Flow = "landing" | "signin" | "register" | "onboarding" | "payment" | "app";
export type MainTab = "dashboard" | "portfolio" | "scores" | "leaderboard" | "courses";
export type GoogleAuthResult = { user: UserData; isNewUser: boolean };

export type UserData = {
  studentId: string;
  fullName: string;
  age: string;
  dateOfBirth: string;
  email: string;
  phoneNumber: string;
  university: string;
  yearOfStudy: string;
  password: string;
};

export type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export type Position = {
  id: string;
  tradeId: string;
  studentId: string;
  addedBy: string;
  tradeDate: string;
  stockTicker: string;
  stockName: string;
  sector: string;
  allocationPercent: number;
  amountInvested: string;
  buyPrice: string;
  currentSellPrice: string;
  tradeType: "Buy" | "Sell";
  tag1: string;
  tag2: string;
  tag3: string;
  thesis: string;
};

export type PortfolioSetup = {
  studentId: string;
  totalCapital: string;
  riskAppetite: "High" | "Moderate" | "Low";
  investmentHorizon: string;
  competitionRound: string;
};

export type WeeklyScore = {
  studentId: string;
  weekNumber: string;
  totalReturnScore: number;
  benchmarkReturnScore: number;
  netProfitMarginScore: number;
  sharpeRatioScore: number;
  maxDrawdownScore: number;
  portfolioBetaScore: number;
  diversificationScore: number;
  tradeConsistencyScore: number;
  predictionAccuracyScore: number;
  tradeExecutionScore: number;
  aiThesisScore: number;
  weeklyTotalScore: number;
  weeklyRank: number;
};

export type OverallScoreSummary = {
  studentId: string;
  week1Total: number;
  week2Total: number;
  week3Total: number;
  week4Total: number;
  cumulativeScore: number;
  reportScoreManual: number;
  finalScore: number;
  overallRank: number;
};

export interface Course {
  course_id: number;
  title: string;
  description: string;
  instructor_name: string;
  instructor_title: string;
  video_url: string;
  thumbnail_url: string;
  duration_minutes: number;
  week_number: number;
  category: 'Risk Management' | 'Technical Analysis' | 'Options' | 'Fixed Income' | 'Macro' | 'Portfolio Theory';
  is_published: boolean;
  created_at: string;
}

export interface CourseProgress {
  id: number;
  user_id: string;
  course_id: number;
  watched_percent: number;
  completed: boolean;
  completed_at?: string;
}
