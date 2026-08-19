import { Image } from "expo-image";
import { AlertCircle, Check, Eye, EyeOff } from "lucide-react-native";
import type React from "react";
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { brandLogo, C, font } from "../constants";
import { tapHaptic } from "../utils";

export function GlassCard({
  children,
  style,
  accent = C.cyan,
}: {
  children: React.ReactNode;
  style?: object;
  accent?: string;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: "rgba(10,16,32,0.58)",
          borderColor: `${accent}4d`,
          borderWidth: 1,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: `0 18px 46px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 30px ${accent}33`,
        } as object,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({
  title,
  accent = C.cyan,
  right,
}: {
  title: string;
  accent?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          selectable
          style={{
            color: accent,
            fontFamily: font.heading,
            fontSize: 17,
            textTransform: "uppercase",
            flexShrink: 1,
            maxWidth: "58%",
          }}
        >
          {title}
        </Text>
        <View
          style={{
            flex: 1,
            minWidth: 34,
            height: 2,
            borderRadius: 3,
            backgroundColor: accent,
            opacity: 0.86,
            boxShadow: `0 0 14px ${accent}`,
          }}
        />
        {right}
      </View>
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "ghost" | "gold";
  disabled?: boolean;
}) {
  const primary = variant === "primary";
  const gold = variant === "gold";
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={{
        minHeight: 54,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 16,
        opacity: disabled ? 0.55 : 1,
        backgroundColor: primary
          ? "rgba(30,230,163,0.13)"
          : gold
          ? "rgba(255,209,102,0.13)"
          : "rgba(255,255,255,0.075)",
        borderColor: primary
          ? "rgba(30,230,163,0.78)"
          : gold
          ? "rgba(255,209,102,0.62)"
          : C.border2,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        boxShadow: primary
          ? "0 12px 30px rgba(30,230,163,0.22), inset 0 1px 0 rgba(255,255,255,0.16)"
          : gold
          ? "0 12px 30px rgba(255,209,102,0.18), inset 0 1px 0 rgba(255,255,255,0.14)"
          : "0 10px 24px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    >
      <Text
        selectable
        style={{
          color: primary ? C.green : gold ? C.gold : C.text0,
          fontFamily: font.medium,
          fontSize: 15,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      {icon}
    </TouchableOpacity>
  );
}

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3C33.65 32.66 29.22 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92Z"
      />
      <Path
        fill="#FF3D00"
        d="m6.31 14.69 6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69Z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.14 35.15 26.63 36 24 36c-5.2 0-9.62-3.31-11.28-7.94l-6.52 5.03C9.51 39.56 16.23 44 24 44Z"
      />
      <Path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.57l.01-.01 6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92Z"
      />
    </Svg>
  );
}

export function GoogleAuthButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      disabled={disabled}
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={{
        minHeight: 54,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        opacity: disabled ? 0.58 : 1,
        backgroundColor: "#ffffff",
        borderColor: "rgba(255,255,255,0.82)",
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 10,
        boxShadow: "0 14px 34px rgba(0,0,0,0.28)",
      }}
    >
      <GoogleLogo />
      <Text
        selectable
        style={{
          color: "#1f2937",
          fontFamily: font.medium,
          fontSize: 15,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function AuthDivider() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border2 }} />
      <Text
        selectable
        style={{
          color: C.text2,
          fontFamily: font.medium,
          fontSize: 11,
          textTransform: "uppercase",
        }}
      >
        or
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border2 }} />
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  showPasswordToggle,
  multiline,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "decimal-pad" | "number-pad";
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  multiline?: boolean;
  error?: string;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const secure = Boolean(secureTextEntry && !passwordVisible);
  return (
    <View style={{ gap: 7 }}>
      <Text
        selectable
        style={{
          color: C.text2,
          fontFamily: font.medium,
          fontSize: 11,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <View
        style={{
          minHeight: multiline ? 104 : 50,
          borderRadius: 14,
          borderColor: error ? C.red : C.border,
          borderWidth: 1,
          backgroundColor: "rgba(255,255,255,0.055)",
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#596582"
          keyboardType={keyboardType}
          secureTextEntry={secure}
          multiline={multiline}
          style={{
            flex: 1,
            minHeight: multiline ? 104 : 48,
            color: C.text0,
            fontFamily: font.regular,
            fontSize: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
        {showPasswordToggle ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={{ width: 46, minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            {passwordVisible ? <EyeOff size={18} color={C.text1} /> : <Eye size={18} color={C.text1} />}
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <ErrorText message={error} /> : null}
    </View>
  );
}

export function ErrorText({ message }: { message: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <AlertCircle size={14} color={C.red} />
      <Text
        selectable
        style={{
          color: C.red,
          fontFamily: font.medium,
          fontSize: 11,
          flex: 1,
          lineHeight: 16,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 9,
        alignItems: "flex-start",
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,95,126,0.38)",
        backgroundColor: "rgba(255,95,126,0.10)",
      }}
    >
      <AlertCircle size={17} color={C.red} />
      <Text
        selectable
        style={{
          color: C.red,
          fontFamily: font.medium,
          fontSize: 12,
          lineHeight: 17,
          flex: 1,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export function CheckboxRow({
  checked,
  onToggle,
  label,
  error,
}: {
  checked: boolean;
  onToggle: () => void;
  label: React.ReactNode;
  error?: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          tapHaptic();
          onToggle();
        }}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 11,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? C.red : checked ? "rgba(30,230,163,0.55)" : C.border,
          backgroundColor: checked ? "rgba(30,230,163,0.08)" : "rgba(255,255,255,0.045)",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: checked ? C.green : C.border2,
            backgroundColor: checked ? "rgba(30,230,163,0.18)" : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {checked ? <Check size={13} color={C.green} strokeWidth={3} /> : null}
        </View>
        <Text
          selectable
          style={{
            color: C.text1,
            fontFamily: font.regular,
            fontSize: 12.5,
            lineHeight: 18,
            flex: 1,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
      {error ? <ErrorText message={error} /> : null}
    </View>
  );
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        minWidth: 84,
        borderRadius: 999,
        backgroundColor: active ? "rgba(49,230,255,0.15)" : "rgba(255,255,255,0.055)",
        borderColor: active ? C.cyan : C.border,
        borderWidth: 1,
      }}
    >
      <Text
        selectable
        style={{
          color: active ? C.cyan : C.text1,
          fontFamily: font.medium,
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function HeaderMini({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 }}>
      <Image source={brandLogo} style={{ width: 42, height: 42, borderRadius: 12 }} />
      <View style={{ flex: 1 }}>
        <Text
          selectable
          style={{
            color: C.text0,
            fontFamily: font.heading,
            fontSize: 25,
            textTransform: "uppercase",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            selectable
            style={{
              color: C.text2,
              fontFamily: font.regular,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function StepDots({ current }: { current: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {["Register", "Onboard", "Pay", "Compete"].map((step, index) => (
        <View key={step} style={{ alignItems: "center", gap: 6, flex: 1 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              borderColor: index <= current ? C.cyan : C.border2,
              borderWidth: 1,
              backgroundColor: index <= current ? "rgba(49,230,255,0.14)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Text
              selectable
              style={{
                color: index <= current ? C.cyan : C.text2,
                fontFamily: font.mono,
                fontSize: 11,
              }}
            >
              {index + 1}
            </Text>
          </View>
          <Text
            selectable
            style={{
              color: index <= current ? C.text1 : C.text2,
              fontSize: 10,
              fontFamily: font.medium,
            }}
          >
            {step}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Progress({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text selectable style={{ color: C.text1, fontFamily: font.regular, fontSize: 13, flex: 1 }}>
          {label}
        </Text>
        <Text selectable style={{ color, fontFamily: font.mono, fontSize: 12 }}>
          {value}/100
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 8, backgroundColor: C.bg3, overflow: "hidden" }}>
        <View style={{ width: `${value}%`, height: "100%", backgroundColor: color, borderRadius: 8 }} />
      </View>
    </View>
  );
}
