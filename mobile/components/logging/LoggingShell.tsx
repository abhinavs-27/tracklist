import { View, StyleSheet } from "react-native";
import { useAuth } from "../../lib/hooks/useAuth";
import { useLogging } from "../../lib/logging-context";
import { FloatingLogButton } from "./FloatingLogButton";
import { LogToast } from "./LogToast";
import { QuickLogModal } from "./QuickLogModal";

export function LoggingShell() {
  const { session } = useAuth();
  const { quickLogOpen, setQuickLogOpen, toastMessage, dismissToast } =
    useLogging();

  if (!session) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <FloatingLogButton />
      <QuickLogModal
        visible={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        source="manual"
      />
      <LogToast message={toastMessage} onDismiss={dismissToast} />
    </View>
  );
}
