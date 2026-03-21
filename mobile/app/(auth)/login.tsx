import { useState } from "react";
import type { PressableStateCallbackType } from "react-native";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/hooks/useAuth";
import { theme } from "../../lib/theme";

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    setError(null);
    setBusy(true);
    try {
      const { error: err, cancelled } = await signInWithGoogle();
      if (cancelled) {
        setError("Sign in was cancelled.");
        return;
      }
      if (err) {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        paddingHorizontal: 24,
        justifyContent: "center",
        gap: 32,
      }}
    >
      <View style={{ alignItems: "center", gap: 12 }}>
        <Image
          source={require("../../assets/icon.png")}
          style={{ width: 88, height: 88, borderRadius: 20 }}
          resizeMode="contain"
        />
        <Text style={{ ...theme.text.title, color: theme.colors.text }}>
          Tracklist
        </Text>
      </View>

      {error ? (
        <Text
          style={{
            color: theme.colors.danger,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={onContinue}
        disabled={busy}
        style={({ pressed }: PressableStateCallbackType) => [
          {
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: theme.colors.panel,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 10,
            opacity: pressed || busy ? 0.85 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={theme.colors.emerald} />
        ) : (
          <Text
            style={{
              fontSize: 16,
              fontWeight: "800",
              color: theme.colors.text,
            }}
          >
            Continue with Google
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}
