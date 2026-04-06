import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { theme } from "@/lib/theme";

export type YearRange = {
  startYear?: number;
  endYear?: number;
};

type Props = {
  value: YearRange;
  onChange: (range: YearRange) => void;
};

const labelStyle: TextStyle = {
  color: theme.colors.muted,
  fontSize: 11,
  fontWeight: "700",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

export function YearRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [prevValue, setPrevValue] = useState(value);
  const [startInput, setStartInput] = useState<string>(
    value.startYear ? String(value.startYear) : "",
  );
  const [endInput, setEndInput] = useState<string>(
    value.endYear ? String(value.endYear) : "",
  );

  if (value.startYear !== prevValue.startYear || value.endYear !== prevValue.endYear) {
    setPrevValue(value);
    setStartInput(value.startYear ? String(value.startYear) : "");
    setEndInput(value.endYear ? String(value.endYear) : "");
  }

  const label = useMemo(() => {
    const { startYear, endYear } = value;
    if (!startYear && !endYear) return "All time";
    if (startYear && !endYear) return String(startYear);
    if (!startYear && endYear) return String(endYear);
    if (startYear === endYear) return String(startYear);
    return `${startYear} – ${endYear}`;
  }, [value.startYear, value.endYear]);

  function handleApply() {
    const start = startInput ? parseInt(startInput, 10) : undefined;
    const end = endInput ? parseInt(endInput, 10) : undefined;

    if (start && (start < 1900 || start > 2100)) return;
    if (end && (end < 1900 || end > 2100)) return;

    let nextStart = start;
    let nextEnd = end;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      [nextStart, nextEnd] = [nextEnd, nextStart];
    }

    onChange({ startYear: nextStart, endYear: nextEnd });
    setOpen(false);
  }

  function handleClear() {
    setStartInput("");
    setEndInput("");
    onChange({});
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          alignSelf: "stretch",
          minHeight: 44,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.panelSoft,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: theme.colors.emerald,
          }}
        />
        <Text
          style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.85}
        >
          {label}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          <View
            style={{
              margin: 24,
              backgroundColor: theme.colors.bg,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 16,
            }}
          >
            <Text
              style={{
                ...labelStyle,
                fontSize: 10,
                marginBottom: 12,
              }}
            >
              Release year
            </Text>

            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Start</Text>
                <TextInput
                  value={startInput}
                  onChangeText={setStartInput}
                  placeholder="e.g. 1990"
                  keyboardType="number-pad"
                  maxLength={4}
                  style={{
                    marginTop: 8,
                    backgroundColor: theme.colors.panelSoft,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    color: theme.colors.text,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                />
              </View>

              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "700" }}>
                to
              </Text>

              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>End</Text>
                <TextInput
                  value={endInput}
                  onChangeText={setEndInput}
                  placeholder="e.g. 1999"
                  keyboardType="number-pad"
                  maxLength={4}
                  style={{
                    marginTop: 8,
                    backgroundColor: theme.colors.panelSoft,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                    color: theme.colors.text,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                />
              </View>
            </View>

            <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 10 }}>
              Leave both empty for all time, or set a single year.
            </Text>

            <View
              style={{
                marginTop: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Pressable
                onPress={handleClear}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: "transparent",
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "800" }}>
                  Clear filter
                </Text>
              </Pressable>
              <Pressable
                onPress={handleApply}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: theme.colors.emerald,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>
                  Apply
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

