import { View, Text, TouchableOpacity } from "react-native";
import { theme } from "../../lib/theme";

type Option = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

export function ViewToggle({ value, options, onChange }: Props) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.colors.panelSoft,
        borderRadius: 999,
        padding: 2,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 7,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: active ? theme.colors.active : "transparent",
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontSize: theme.text.small.fontSize,
                fontWeight: theme.text.small.fontWeight,
                color: active ? theme.colors.text : theme.colors.muted,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.85}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

