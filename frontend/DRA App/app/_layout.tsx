import "react-native-url-polyfill/auto";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Pressable, SafeAreaView, Text, View } from "react-native";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
WebBrowser.maybeCompleteAuthSession();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#060810" }}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
        <Text style={{ color: "#ff5f7e", fontSize: 22, fontWeight: "700" }}>
          TradeIQ could not start
        </Text>
        <Text style={{ color: "#c7d0ea", fontSize: 14 }}>
          {error?.message || "An unexpected startup error occurred."}
        </Text>
        <Pressable
          onPress={retry}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 10,
            backgroundColor: "#1ee6a3",
          }}
        >
          <Text style={{ color: "#060810", fontWeight: "700" }}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
