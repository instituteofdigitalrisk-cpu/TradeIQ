import { ChevronLeft, LogIn, Mail, ShieldCheck, KeyRound } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import type { UserData } from "../types";
import { AppButton, ErrorNotice, Field, GlassCard, HeaderMini } from "../components/ui";
import { auth } from "../api";

type Step = "signin" | "request" | "verify" | "reset";

export function SignInPage({
  onSubmit,
  onBack,
}: {
  onSubmit: (email: string, password: string) => Promise<UserData | string | null>;
  onBack: () => void;
}) {
  const [step, setStep] = useState<Step>("signin");

  // Sign-in fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot-password state (shared across the request/verify/reset steps)
  const [resetEmail, setResetEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const handleRequestCode = async () => {
    setResetError("");
    if (!resetEmail.trim()) {
      setResetError("Enter your registered email address.");
      return;
    }
    setResetSubmitting(true);
    try {
      await auth.forgotPassword(resetEmail.trim().toLowerCase());
      Toast.show({
        type: "success",
        text1: "Code sent",
        text2: "Check your inbox for a verification code from info@digitalriskacademy.com.",
      });
      setStep("verify");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not send the code. Please try again.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    setResetError("");
    if (!code.trim()) {
      setResetError("Enter the code from your email.");
      return;
    }
    setResetSubmitting(true);
    try {
      const { reset_token } = await auth.verifyResetCode(resetEmail.trim().toLowerCase(), code.trim());
      setResetToken(reset_token);
      setStep("reset");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setResetError("");
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetSubmitting(true);
    try {
      await auth.resetPassword(resetToken, newPassword);
      Toast.show({
        type: "success",
        text1: "Password reset",
        text2: "You can now sign in with your new password.",
      });
      setEmail(resetEmail);
      setPassword("");
      setResetEmail("");
      setCode("");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("signin");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not reset your password. Please try again.");
    } finally {
      setResetSubmitting(false);
    }
  };

  const backButton = (onPress: () => void) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start", paddingVertical: 6 }}>
      <ChevronLeft size={18} color={C.text1} />
      <Text selectable style={{ color: C.text1, fontFamily: font.medium, fontSize: 13 }}>
        Back
      </Text>
    </TouchableOpacity>
  );

  if (step === "request") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
          {backButton(() => { setResetError(""); setStep("signin"); })}
          <HeaderMini title="Forgot Password" subtitle="We'll email you a verification code." />
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
              label={resetSubmitting ? "Sending Code..." : "Send Verification Code"}
              onPress={handleRequestCode}
              disabled={resetSubmitting || !resetEmail.trim()}
              icon={<Mail size={18} color={C.green} />}
            />
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === "verify") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
          {backButton(() => { setResetError(""); setStep("request"); })}
          <HeaderMini title="Enter Verification Code" subtitle={`Sent to ${resetEmail}`} />
          <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
            <Field
              label="6-Digit Code"
              value={code}
              onChangeText={(value) => { setResetError(""); setCode(value.replace(/\D/g, "").slice(0, 6)); }}
              placeholder="123456"
              keyboardType="numeric"
            />
            {resetError ? <ErrorNotice message={resetError} /> : null}
            <AppButton
              label={resetSubmitting ? "Verifying..." : "Verify Code"}
              onPress={handleVerifyCode}
              disabled={resetSubmitting || code.length !== 6}
              icon={<ShieldCheck size={18} color={C.green} />}
            />
            <TouchableOpacity onPress={handleRequestCode} disabled={resetSubmitting}>
              <Text selectable style={{ color: C.cyan, fontFamily: font.medium, fontSize: 12, textAlign: "center" }}>
                Resend code
              </Text>
            </TouchableOpacity>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === "reset") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
          <HeaderMini title="Set New Password" subtitle="" />
          <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
            <Field
              label="New Password"
              value={newPassword}
              onChangeText={(value) => { setResetError(""); setNewPassword(value); }}
              placeholder="Minimum 6 characters"
              secureTextEntry
              showPasswordToggle
            />
            <Field
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(value) => { setResetError(""); setConfirmPassword(value); }}
              placeholder="Re-enter password"
              secureTextEntry
              showPasswordToggle
            />
            {resetError ? <ErrorNotice message={resetError} /> : null}
            <AppButton
              label={resetSubmitting ? "Saving..." : "Reset Password"}
              onPress={handleResetPassword}
              disabled={resetSubmitting || !newPassword.trim() || !confirmPassword.trim()}
              icon={<KeyRound size={18} color={C.green} />}
            />
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}>
        {backButton(onBack)}
        <HeaderMini title="Login to your Account" subtitle="" />
        <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
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
