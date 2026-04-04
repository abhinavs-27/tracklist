import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { theme } from "@/lib/theme";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((o: boolean) => !o)}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.chevron} accessibilityLabel={open ? "Collapse" : "Expand"}>
          {open ? "−" : "+"}
        </Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: "rgba(24,24,27,0.45)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  headerPressed: { opacity: 0.9 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    color: theme.colors.muted,
    lineHeight: 16,
  },
  chevron: {
    fontSize: 22,
    fontWeight: "300",
    color: theme.colors.muted,
    width: 28,
    textAlign: "center",
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
});
