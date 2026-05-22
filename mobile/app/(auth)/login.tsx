import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/lib/hooks/useAuth";
import { theme } from "@/lib/theme";

const PRIVACY_URL = `${process.env.EXPO_PUBLIC_API_URL ?? "https://tracklist.lol"}/privacy`;

function GoogleIcon() {
  return (
    <View style={s.googleIcon}>
      <Text style={s.googleG}>G</Text>
    </View>
  );
}

export default function LoginScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const busy = googleBusy || appleBusy;

  async function onGoogle() {
    setError(null);
    setGoogleBusy(true);
    try {
      const { error: err, cancelled } = await signInWithGoogle();
      if (cancelled) return;
      if (err) setError(err.message);
    } finally {
      setGoogleBusy(false);
    }
  }

  async function onApple() {
    setError(null);
    setAppleBusy(true);
    try {
      const { error: err, cancelled } = await signInWithApple();
      if (cancelled) return;
      if (err) setError(err.message);
    } finally {
      setAppleBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      {/* Ambient background glows */}
      <View style={[s.glow, s.glowTop]} pointerEvents="none" />
      <View style={[s.glow, s.glowBottom]} pointerEvents="none" />

      {/* Main content */}
      <View style={s.hero}>
        <View style={s.iconWrap}>
          <Image
            source={require("../../assets/icon.png")}
            style={s.icon}
            resizeMode="cover"
          />
        </View>
        <Text style={s.wordmark}>Tracklist</Text>
        <Text style={s.tagline}>Your music, your people.</Text>
      </View>

      {/* Bottom section */}
      <View style={s.bottom}>
        <View style={s.pills}>
          {["Log listens", "Rate albums", "Follow friends", "Discover"].map((f) => (
            <View key={f} style={s.pill}>
              <Text style={s.pillText}>{f}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Apple Sign-in — real button when available; dev placeholder otherwise */}
        {Platform.OS === "ios" ? (
          appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={s.appleBtn}
              onPress={onApple}
            />
          ) : __DEV__ ? (
            <View style={[s.appleBtn, s.appleBtnDevStub]}>
              <Text style={s.appleBtnDevText}>Sign in with Apple (sign into iCloud in simulator to enable)</Text>
            </View>
          ) : null
        ) : null}

        {/* Google sign-in button */}
        <Pressable
          onPress={onGoogle}
          disabled={busy}
          style={({ pressed }) => [s.googleBtn, (pressed || googleBusy) && s.googleBtnPressed]}
        >
          {googleBusy ? (
            <ActivityIndicator color="#111" />
          ) : (
            <>
              <GoogleIcon />
              <Text style={s.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <Text style={s.legal}>
          By continuing you agree to our{" "}
          <Text
            style={s.legalLink}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    opacity: 0.18,
  },
  glowTop: {
    backgroundColor: theme.colors.emerald,
    top: -140,
    left: -80,
  },
  glowBottom: {
    backgroundColor: "#6366f1",
    bottom: -140,
    right: -80,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: theme.colors.emerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    marginBottom: 8,
  },
  icon: {
    width: "100%",
    height: "100%",
  },
  wordmark: {
    fontSize: 40,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -1.5,
  },
  tagline: {
    fontSize: 16,
    color: theme.colors.muted,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 4,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(63,63,70,0.8)",
    backgroundColor: "rgba(24,24,27,0.8)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.muted,
  },
  appleBtn: {
    height: 50,
    width: "100%",
  },
  appleBtnDevStub: {
    backgroundColor: "#1c1c1e",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  appleBtnDevText: {
    fontSize: 12,
    color: "#71717a",
    textAlign: "center",
    paddingHorizontal: 12,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  googleBtnPressed: { opacity: 0.88 },
  googleBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 14,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  legal: {
    fontSize: 11,
    color: "#52525b",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  legalLink: {
    color: "#71717a",
    textDecorationLine: "underline",
  },
});
