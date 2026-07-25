import { confirmPasswordReset } from "firebase/auth";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, ErrorNotice, Field, GlassCard, HeaderMini } from "../components/ui";
import { C, font } from "../constants";
import { firebaseAuth } from "../../firebase";

function getResetCode(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("oobCode") || "";
}

export function ResetPasswordPage({ onComplete }: { onComplete: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const resetCode = getResetCode();

  const handleReset = async () => {
    setError("");
    setMessage("");
    if (!resetCode) {
      setError("This password reset link is invalid or incomplete.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(firebaseAuth, resetCode, newPassword);
      setMessage("Password updated successfully. You can now sign in.");
    } catch (err) {
      console.error("Firebase password reset failed:", err);
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40, maxWidth: 620, width: "100%", alignSelf: "center" }}
      >
        <HeaderMini title="Reset your password" subtitle="Choose a new password for your TradeIQ account." />
        <GlassCard style={{ padding: 18, gap: 15 }} accent={C.cyan}>
          {message ? <Text style={{ color: C.green, fontFamily: font.medium }}>{message}</Text> : null}
          {error ? <ErrorNotice message={error} /> : null}
          {!message ? (
            <>
              <Field
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter a new password"
                secureTextEntry
                showPasswordToggle
                error={error && newPassword.length < 6 ? error : undefined}
              />
              <Field
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your new password"
                secureTextEntry
                showPasswordToggle
              />
              <AppButton
                label={submitting ? "Updating..." : "Update Password"}
                onPress={handleReset}
                disabled={submitting}
              />
            </>
          ) : null}
          <AppButton label="Back to Sign In" onPress={onComplete} variant="ghost" />
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
