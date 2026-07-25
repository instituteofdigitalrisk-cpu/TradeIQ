import { ChevronRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { C, font } from "../constants";
import { generateStudentId } from "../auth-store";
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
    phone: "",
    college: "",
    degree: "",
    passoutYear: "2026",
    password: "",
    acceptedTerms: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadStudentId = async () => {
      const studentId = await generateStudentId();
      if (!cancelled) {
        setFormData((prev) => ({ ...prev, studentId }));
      }
    };

    void loadStudentId();
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!formData.email.trim() || !formData.email.includes("@")) {
      errs.email = "Valid email address is required";
    }
    if (!formData.phone.trim() || formData.phone.length < 10) {
      errs.phone = "Valid phone number is required";
    }
    if (!formData.college.trim()) errs.college = "College/University name is required";
    if (!formData.degree.trim()) errs.degree = "Degree program is required";
    if (!formData.password || formData.password.length < 6) {
      errs.password = "Password must be at least 6 characters";
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
            label="Student ID (Auto)"
            value={formData.studentId}
            onChangeText={() => {}}
            placeholder="Generated Student ID"
          />

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
            error={errors.email}
          />

          <Field
            label="Phone Number"
            value={formData.phone}
            onChangeText={(v) => handleChange("phone", v)}
            placeholder="+1 234 567 8900"
            keyboardType="phone-pad"
            error={errors.phone}
          />

          <Field
            label="College / Institution"
            value={formData.college}
            onChangeText={(v) => handleChange("college", v)}
            placeholder="Harvard University"
            error={errors.college}
          />

          <Field
            label="Degree Program"
            value={formData.degree}
            onChangeText={(v) => handleChange("degree", v)}
            placeholder="B.S. Finance / Computer Science"
            error={errors.degree}
          />

          <Field
            label="Password"
            value={formData.password}
            onChangeText={(v) => handleChange("password", v)}
            placeholder="••••••••"
            secureTextEntry
            showPasswordToggle
            error={errors.password}
          />

          <CheckboxRow
            checked={formData.acceptedTerms}
            onToggle={() => handleChange("acceptedTerms", !formData.acceptedTerms)}
            label="I confirm that I am 18 years of age or older. By registering, I agree to TradeIQ terms of use and confirm the information I have provided is accurate."
            error={errors.terms}
          />

          <AppButton
            label={loading ? "Registering..." : "Continue Registration"}
            onPress={handleSubmit}
            disabled={loading}
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
