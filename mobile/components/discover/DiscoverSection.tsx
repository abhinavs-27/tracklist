import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../../lib/theme";

type Props = {
  title: string;
  /** e.g. "See all" — display only; no action */
  seeAllLabel?: string;
  children: ReactNode;
};

export function DiscoverSection({ title, seeAllLabel, children }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {seeAllLabel ? (
          <Text style={styles.seeAll}>{seeAllLabel}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
  },
});
