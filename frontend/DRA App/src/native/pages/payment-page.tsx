import { CheckCircle, CreditCard, Lock, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, prizePoolImage, font } from "../constants";
import { Image } from "expo-image";
import { AppButton, Field, GlassCard, HeaderMini, StepDots } from "../components/ui";
import * as WebBrowser from "expo-web-browser";

export function PaymentPage({ onComplete }: { onComplete: () => void }) {
  
  const pay = async () => {
    await WebBrowser.openBrowserAsync(
      "https://buy.stripe.com/bJe5kC31I2TOdJlh1ocV206"
    );
  };

  const formatCard = (value: string) => value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg0 }} edges={["top", "left", "right"]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
        <HeaderMini title="Course Fees" subtitle="Secure your early access seat" />
        <StepDots current={2} />

        <View
          style={{
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(255,209,102,0.12)",
              borderColor: "rgba(255,209,102,0.35)",
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 8,
              marginBottom: 18,
            }}
          >
            <Text
              style={{
                color: C.gold,
                fontFamily: font.medium,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              Early Access
            </Text>
          </View>

          <Text
            style={{
              color: C.text2,
              fontSize: 24,
              textDecorationLine: "line-through",
              marginBottom: -8,
            }}
          >
            $10
          </Text>

          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Text
              style={{
                color: C.text0,
                fontSize: 78,
                fontFamily: font.headingHeavy,
                lineHeight: 90,
              }}
            >
              $7
            </Text>

            <View
              style={{
                marginTop: 20,
                marginLeft: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "rgba(49,230,255,0.12)",
              }}
            >
              <Text
                style={{
                  color: C.cyan,
                  fontSize: 12,
                  fontFamily: font.medium,
                }}
              >
                USD
              </Text>
            </View>
          </View>

          <Text
            style={{
              color: C.green,
              fontFamily: font.medium,
              fontSize: 14,
              marginTop: -6,
            }}
          >
            Save 30% during Early Access
          </Text>

        </View>

        <GlassCard
          style={{
            padding: 24,
            marginTop: 25,
          }}
        >

          {[
            "Portfolio Tracking",
            "Mentor Sessions",
            "Investment Banking Simulation",
            "Sales & Trading Challenges",
            "Risk Management Exercises",
          ].map((item, i) => (

            <View key={item}>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 14,
                }}
              >

                <CheckCircle size={20} color={C.green} />

                <Text
                  style={{
                    color: C.text1,
                    fontSize: 15,
                    fontFamily: font.regular,
                  }}
                >
                  {item}
                </Text>

              </View>

              {i !== 5 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                />
              )}

            </View>

          ))}

        </GlassCard>



        <GlassCard
          accent={C.gold}
          style={{
            overflow: "hidden",
            marginTop: 22,
            paddingBottom: 18,
          }}
        >

          <Image
            source={prizePoolImage}
            style={{
              width: "100%",
              height: 220,
            }}
            contentFit="cover"
          />

        </GlassCard>

        <AppButton
          icon={<CreditCard size={18} color={C.gold} />}
          label="Pay $7 with Stripe"
          onPress={pay}
          variant="gold"
        />

        <Text
          style={{
            color: C.text2,
            fontSize: 12,
            textAlign: "center",
            marginTop: 12,
            lineHeight: 20,
          }}
        >
          You will be redirected to Stripe's secure checkout page to complete your payment.
        </Text>


        <AppButton
          label="Skip for Demo"
          onPress={onComplete}
          variant="ghost"
        />

      </ScrollView>
    </SafeAreaView>
  );
}
