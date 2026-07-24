import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { ChevronRight } from "lucide-react-native";
import { useEffect } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  brandLogo,
  C,
  font,
  heroVideo,
  prizePoolImage,
  tradeIqLogo,
} from "../constants";
import { AppButton } from "../components/ui";

export function LandingPage({
  onExplore,
}: {
  onExplore: () => void | Promise<void>;
}) {
  const player = useVideoPlayer(heroVideo, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    player.play();
  }, [player]);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const contentMaxWidth = isDesktop ? 640 : 520;
  const sidePadding = isDesktop ? 48 : 22;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: C.bg0 }}
      edges={["top", "left", "right"]}
    >
      {/* Video Background */}
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        allowsFullscreen={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.7,
        }}
      />

      {/* Cinematic gradient — keeps text legible without flattening the video */}
      <LinearGradient
        colors={[
          "rgba(5,8,18,0.55)",
          "rgba(5,8,18,0.35)",
          "rgba(5,8,18,0.55)",
          "rgba(5,8,18,0.92)",
        ]}
        locations={[0, 0.35, 0.7, 1]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: sidePadding,
          paddingTop: 24,
          paddingBottom: 32,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: contentMaxWidth, flex: 1 }}>
          {/* Header */}
          <View style={{ alignItems: "center", gap: 12 }}>
            <Image
              source={brandLogo}
              style={{
                width: isDesktop ? 64 : 56,
                height: isDesktop ? 64 : 56,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.border2,
              }}
            />

            <View style={{ alignItems: "center", gap: 3 }}>
              <Text
                selectable
                style={{
                  color: C.text1,
                  fontFamily: font.medium,
                  fontSize: 16,
                }}
              >
                Digital Risk Academy
              </Text>

              <Text
                selectable
                style={{
                  color: C.text2,
                  fontFamily: font.regular,
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                presents
              </Text>
            </View>

            {/* Thin accent divider for a bit of polish under the header */}
            <View
              style={{
                width: 36,
                height: 2,
                borderRadius: 999,
                backgroundColor: C.green,
                opacity: 0.5,
                marginTop: 2,
              }}
            />
          </View>

          {/* Hero Content */}
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
              paddingTop: isDesktop ? 36 : 26,
              paddingBottom: 20,
            }}
          >
            <Image
              source={tradeIqLogo}
              contentFit="contain"
              style={{
                width: "100%",
                maxWidth: isDesktop ? 600 : 460,
                aspectRatio: 3.6,
              }}
            />

            {/* Stat chips row */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  backgroundColor: "rgba(30,230,163,0.11)",
                  borderColor: "rgba(30,230,163,0.42)",
                  borderWidth: 1,
                }}
              >
                <Text
                  selectable
                  style={{
                    color: C.green,
                    fontFamily: font.medium,
                    fontSize: 11,
                  }}
                >
                  Paper capital $10,000
                </Text>
              </View>

              
            </View>

            <Text
              selectable
              style={{
                color: C.silver,
                fontFamily: font.headingHeavy,
                fontSize: isDesktop ? 34 : 23,
                lineHeight: isDesktop ? 42 : 29,
                letterSpacing: 0.4,
                textAlign: "center",
                maxWidth: 760,
                textTransform: "uppercase",
                textShadowColor: "rgba(255,255,255,0.45)",
                textShadowRadius: 12,
                textShadowOffset: { width: 0, height: 1 },
              }}
            >
              Investment Banking Sales & Trading Risk Challenge
            </Text>

            
            {/* CTA */}
            <View
              style={{
                marginTop: 10,
                width: "100%",
                maxWidth: 320,
                alignSelf: "center",
                borderRadius: 16,
                shadowColor: C.green,
                shadowOpacity: 0.35,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 10 },
              }}
            >
              <AppButton
                label="Get Started"
                onPress={onExplore}
                icon={<ChevronRight size={18} color={C.green} />}
              />
            </View>

            {/* Disclaimer */}
            <View
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.08)",
                width: "100%",
                maxWidth: 340,
                alignItems: "center",
              }}
            >
              <Text
                selectable
                style={{
                  color: C.text2,
                  fontFamily: font.regular,
                  fontSize: 11,
                  lineHeight: 17,
                  textAlign: "center",
                  opacity: 0.85,
                }}
              >
                No real money. No real securities. Build a portfolio, defend your strategy, and compete in a premium fintech simulation built for structured
                investing education.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}