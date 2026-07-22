import { useEffect, useState } from "react";
import type React from "react";
import { useFonts as useLoraFonts, Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from "@expo-google-fonts/lora";
import { useFonts as useNeutonFonts, Neuton_700Bold, Neuton_800ExtraBold } from "@expo-google-fonts/neuton";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, Text, useWindowDimensions, View } from "react-native";
import type { Flow, UserData } from "./types";
import { clearActiveUser, getActiveUser, saveRegisteredUser, signInUser, signInWithGoogle } from "./auth-store";
import { setUnauthorizedHandler } from "./api";
import Toast from "react-native-toast-message";
import { LandingPage } from "./pages/landing-page";
import { RegistrationPage } from "./pages/registration-page";
import { OnboardingPage } from "./pages/onboarding-page";
import { PaymentPage } from "./pages/payment-page";
import { MainApp } from "./pages/main-app";
import { SignInPage } from "./pages/sign-in-page";

function ThemedToast(props: any, accent: string) {
  const { text1, text2 } = props;
  return (
    <View
      style={{
        alignSelf: "center",
        maxWidth: 420,
        minWidth: 240,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${accent}99`,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        backgroundColor: "rgba(10,16,32,0.98)",
        boxShadow: `0 18px 48px rgba(0,0,0,0.45), 0 0 26px ${accent}33`,
        gap: 4,
      }}
    >
      {text1 ? (
        <Text numberOfLines={2} style={{ color: accent, fontSize: 14, fontWeight: "700" }}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text numberOfLines={4} style={{ color: "#c7d0ea", fontSize: 12, lineHeight: 17 }}>
          {text2}
        </Text>
      ) : null}
    </View>
  );
}

const toastConfig = {
  success: (props: any) => ThemedToast(props, "#1ee6a3"),
  error: (props: any) => ThemedToast(props, "#ff5f7e"),
  info: (props: any) => ThemedToast(props, "#31e6ff"),
  warning: (props: any) => ThemedToast(props, "#ffd166"),
};

export default function ChallengeApp() {
  const [flow, setFlow] = useState<Flow>("landing");
  const [userData, setUserData] = useState<UserData | null>(null);
  const [booting, setBooting] = useState(true);
  const [loraLoaded] = useLoraFonts({ Lora_400Regular, Lora_600SemiBold, Lora_700Bold });
  const [neutonLoaded] = useNeutonFonts({ Neuton_700Bold, Neuton_800ExtraBold });
  const insets = useSafeAreaInsets();
  const toastTopOffset = insets.top + 12; // sits just under the notch/status bar, always

  const withToast = (screen: React.ReactNode) => (
    <>
      {screen}
      <Toast config={toastConfig} position="top" topOffset={toastTopOffset} visibilityTime={5500} />
    </>
  );

  useEffect(() => {
    let active = true;
    setUnauthorizedHandler(() => {
      void clearActiveUser();
      setUserData(null);
      setFlow("signin");
    });
    getActiveUser().then((activeUser) => {
      if (!active) return;
      if (activeUser) {
        setUserData(activeUser);
        setFlow("app");
      }
      setBooting(false);
    });
    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, []);

  if (booting || !loraLoaded || !neutonLoaded) {
    return withToast(
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#060810" }}>
        <ActivityIndicator color="#31E6FF" />
      </View>
    );
  }

  if (flow === "landing") {
    return withToast(
      <LandingPage
        onExplore={async () => {
          const activeUser = await getActiveUser();
          if (activeUser) {
            setUserData(activeUser);
            setFlow("app");
            return;
          }
          setFlow("register");
        }}
      />
    );
  }
  if (flow === "signin") {
    return withToast(
      <SignInPage
        onBack={() => setFlow("landing")}
        onSubmit={async (email, password) => {
          try {
            const user = await signInUser(email, password);
            if (!user) return null;
            setUserData(user);
            setFlow("app");
            return user;
          } catch (err) {
            return err instanceof Error ? err.message : "Sign in failed";
          }
        }}
      />
    );
  }
  if (flow === "register") {
    return withToast(
      <RegistrationPage
        onSignIn={() => setFlow("signin")}
        onSubmit={async (data) => {
          const savedUser = await saveRegisteredUser(data);
          setUserData(savedUser);
          setFlow("onboarding");
        }}
        onGoogleRegister={async () => {
          try {
            const { user, isNewUser } = await signInWithGoogle();
            setUserData(user);
            setFlow(isNewUser ? "onboarding" : "app");
             return { user, isNewUser }; 
          } catch (err) {
            return err instanceof Error ? err.message : "Google registration failed";
          }
        }}
      />
    );
  }
  if (flow === "onboarding") return withToast(<OnboardingPage onComplete={() => setFlow("payment")} />);
  if (flow === "payment") return withToast(<PaymentPage onComplete={() => setFlow("app")} />);

  return withToast(
    <MainApp
      userData={userData}
      onLogout={() => {
        void clearActiveUser();
        setUserData(null);
        setFlow("landing");
      }}
    />
  );
}

