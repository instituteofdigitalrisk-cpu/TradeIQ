import { ChevronLeft, LogIn } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import type { UserData } from "../types";
import { AppButton, ErrorNotice, Field, GlassCard, HeaderMini } from "../components/ui";

export function SignInPage({
  onSubmit,
  onBack,
}: {
  onSubmit: (email: string, password: string) => Promise<UserData | string | null>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = await onSubmit(email, password);
    if (!result || typeof result === "string") {
      const message = typeof result === "string" ? result : "Sign in failed. Check your connection.";
      setError(message);
      Toast.show({
        type: "error",
        text1: "Login unsuccessful",
        text2: message,
      });
    } else {
      Toast.show({
        type: "success",
        text1: "Login successful",
        text2: "Welcome back. Your dashboard and portfolio tools are now available.",
      });
    }
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
        <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingVertical: 6 }}>
          <ChevronLeft size={18} color={C.text1} />
          <Text selectable style={{ color: C.text1, fontFamily: font.medium, fontSize: 13 }}>
            Back
          </Text>
        </TouchableOpacity>
        <HeaderMini title="Login to your Account" subtitle="" />
        <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
          <Field label="Email" value={email} onChangeText={(value) => {
            setError("");
            setEmail(value);
          }} placeholder="john@university.edu" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={(value) => {
            setError("");
            setPassword(value);
          }} placeholder="Your password" secureTextEntry showPasswordToggle />
          {error ? (
            <ErrorNotice message={error} />
          ) : null}
          <AppButton label={submitting ? "Signing In..." : "Sign In"} onPress={handleSubmit} disabled={submitting || !email.trim() || !password.trim()} icon={<LogIn size={18} color={C.green} />} />
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
