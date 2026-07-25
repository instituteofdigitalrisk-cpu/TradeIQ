import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import type { GoogleAuthResult, RegistrationFormData } from "../types";
import {
  AppButton,
  AuthDivider,
  CheckboxRow,
  ErrorNotice,
  Field,
  GlassCard,
  GoogleAuthButton,
  HeaderMini,
  StepDots,
} from "../components/ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegistrationPage({
  onSubmit,
  onGoogleRegister,
  onSignIn,
}: {
  onSubmit: (data: RegistrationFormData) => void | Promise<void>;
  onGoogleRegister: () => Promise<GoogleAuthResult | string | null>;
  onSignIn: () => void;
}) {
  const [formData, setFormData] = useState<RegistrationFormData>({
    studentId: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptedTerms: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const emailIsValid = EMAIL_PATTERN.test(formData.email.trim());
  const passwordIsValid = formData.password.length >= 6;
  const passwordsMatch = formData.password === formData.confirmPassword;

  const handleChange = (key: keyof RegistrationFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!formData.name.trim()) errs.name = "Full name is required";
    if (!emailIsValid) {
      errs.email = "Valid email address is required";
    }
    if (!passwordIsValid) {
      errs.password = "Password must be at least 6 characters";
    }
    if (!passwordsMatch) {
      errs.confirmPassword = "Passwords do not match";
    }
    if (!formData.acceptedTerms) {
      errs.terms = "You must accept the terms and conditions to proceed";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setGeneralError("");
    if (!validateForm()) return;

    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (err: any) {
      const msg = err?.message || "Registration failed. Please try again.";
      setGeneralError(msg);
      Toast.show({
        type: "error",
        text1: "Registration Error",
        text2: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSubmit = async () => {
    setGeneralError("");
    setLoading(true);
    try {
      const res = await onGoogleRegister();
      if (typeof res === "string") {
        setGeneralError(res);
      }
    } catch (err: any) {
      setGeneralError(err?.message || "Google registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <HeaderMini title="TradeIQ" subtitle="Create your student trader account" />
        <StepDots current={0} />

        <GlassCard style={{ padding: 20, gap: 16 }}>
          <GoogleAuthButton
            label="Sign up with Google"
            onPress={handleGoogleSubmit}
            disabled={loading}
          />

          <AuthDivider />

          {generalError ? <ErrorNotice message={generalError} /> : null}

          <Field
            label="Full Name"
            value={formData.name}
            onChangeText={(v) => handleChange("name", v)}
            placeholder="John Doe"
            error={errors.name}
          />

          <Field
            label="Email Address"
            value={formData.email}
            onChangeText={(v) => handleChange("email", v)}
            placeholder="john@example.com"
            keyboardType="email-address"
            error={errors.email || (formData.email && !emailIsValid ? "Enter a valid email address" : undefined)}
          />

          <Field
            label="Password"
            value={formData.password}
            onChangeText={(v) => handleChange("password", v)}
            placeholder="Minimum 6 characters"
            secureTextEntry
            showPasswordToggle
            error={errors.password || (formData.password && !passwordIsValid ? "Password must be at least 6 characters" : undefined)}
          />

          <Field
            label="Confirm Password"
            value={formData.confirmPassword}
            onChangeText={(v) => handleChange("confirmPassword", v)}
            placeholder="Re-enter your password"
            secureTextEntry
            showPasswordToggle
            error={errors.confirmPassword || (formData.confirmPassword && !passwordsMatch ? "Passwords do not match" : undefined)}
          />

          <CheckboxRow
            checked={formData.acceptedTerms}
            onToggle={() => handleChange("acceptedTerms", !formData.acceptedTerms)}
            label="I confirm that I am 18 years of age or older. By registering, I agree to TradeIQ terms of use and confirm the information I have provided is accurate."
            error={errors.terms}
          />

          <AppButton
            label={loading ? "Registering..." : "Continue to Onboarding"}
            onPress={handleSubmit}
            disabled={loading || !formData.name.trim() || !emailIsValid || !passwordIsValid || !passwordsMatch || !formData.acceptedTerms}
            icon={<ChevronRight size={18} color={C.green} />}
          />

          <TouchableOpacity
            onPress={onSignIn}
            style={{ marginTop: 8, alignItems: "center" }}
          >
            <Text style={{ color: C.text1, fontFamily: font.regular, fontSize: 13 }}>
              Already have an account?{" "}
              <Text style={{ color: C.cyan, fontFamily: font.medium }}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
