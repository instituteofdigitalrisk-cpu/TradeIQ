import { ChevronLeft, LogIn, Mail } from "lucide-react-native";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import type { UserData } from "../types";
import { AppButton, ErrorNotice, Field, GlassCard, GoogleAuthButton, HeaderMini } from "../components/ui";
import { auth } from "../api";
import { firebaseAuth } from "../../firebase";

type Step = "signin" | "request";

const passwordResetActionCodeSettings = {
  url: "https://tradeiq-frontend-kl94.onrender.com",
  handleCodeInApp: true,
};

export function SignInPage({
  onSubmit,
  onGoogleSignIn,
  onBack,
}: {
  onSubmit: (email: string, password: string) => Promise<UserData | string | null>;
  onGoogleSignIn: () => Promise<string | null>;
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>("signin");

  // Sign-in fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot-password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = await onSubmit(email, password);
    if (!result || typeof result === "string") {
      const message = typeof result === "string" ? result : "Sign in failed. Check your connection.";
      setError(message);
      Toast.show({ type: "error", text1: "Login unsuccessful", text2: message });
    } else {
      Toast.show({
        type: "success",
        text1: "Login successful",
        text2: "Welcome back. Your dashboard and portfolio tools are now available.",
      });
    }
    setSubmitting(false);
  };

  // Check the SQL database first, then let Firebase send the reset link.
  const handleRequestCode = async () => {
    setResetError("");
    if (!resetEmail.trim()) {
      setResetError("Enter your registered email address.");
      return;
    }
    setResetSubmitting(true);
    try {
      const normalizedEmail = resetEmail.trim().toLowerCase();
      const registered = await auth.checkRegisteredUser(normalizedEmail);
      if (!registered.exists) {
        setResetError(registered.error || "Email not found in database.");
        return;
      }

      await sendPasswordResetEmail(
        firebaseAuth,
        normalizedEmail,
        passwordResetActionCodeSettings,
      );
      Toast.show({
        type: "success",
        text1: "Password reset email sent!",
        text2: "Check your inbox or spam folder.",
      });
      setStep("signin");
    } catch (err) {
      console.error("Password reset request failed:", err);
      let message = "Could not send the reset email. Please try again.";
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          message = parsed.error || err.message;
        } catch {
          message = err.message;
        }
      }
      setResetError(message);
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSubmitting(true);
    const result = await onGoogleSignIn();
    if (result) {
      setError(result);
      Toast.show({ type: "error", text1: "Google login unsuccessful", text2: result });
    }
    setSubmitting(false);
  };

  const backButton = (onPress: () => void) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingVertical: 6 }}>
      <ChevronLeft size={18} color={C.text1} />
      <Text selectable style={{ color: C.text1, fontFamily: font.medium, fontSize: 13 }}>
        Back
      </Text>
    </TouchableOpacity>
  );

  // STEP 1 UI: Request Code
  if (step === "request") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
          {backButton(() => { setResetError(""); setStep("signin"); })}
          <HeaderMini title="Forgot Password" subtitle="We'll email you a password reset link." />
          <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
            <Field
              label="Registered Email"
              value={resetEmail}
              onChangeText={(value) => { setResetError(""); setResetEmail(value); }}
              placeholder="john@university.edu"
              keyboardType="email-address"
            />
            {resetError ? <ErrorNotice message={resetError} /> : null}
            <AppButton
              label={resetSubmitting ? "Sending Email..." : "Send Reset Email"}
              onPress={handleRequestCode}
              disabled={resetSubmitting || !resetEmail.trim()}
              icon={<Mail size={18} color={C.green} />}
            />
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // DEFAULT UI: Sign In Page
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
        {backButton(onBack)}
        <HeaderMini title="Login to your Account" subtitle="" />
        <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
          <GoogleAuthButton
            label="Continue with Google"
            onPress={() => void handleGoogleSignIn()}
            disabled={submitting}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={(value) => { setError(""); setEmail(value); }}
            placeholder="john@university.edu"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={(value) => { setError(""); setPassword(value); }}
            placeholder="Your password"
            secureTextEntry
            showPasswordToggle
          />
          {error ? <ErrorNotice message={error} /> : null}
          <AppButton label={submitting ? "Signing In..." : "Sign In"} onPress={handleSubmit} disabled={submitting || !email.trim() || !password.trim()} icon={<LogIn size={18} color={C.green} />} />
          <TouchableOpacity onPress={() => { setResetEmail(email); setResetError(""); setStep("request"); }}>
            <Text selectable style={{ color: C.cyan, fontFamily: font.medium, fontSize: 12, textAlign: "center" }}>
              Forgot password?
            </Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
