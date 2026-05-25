export const theme = {
  colors: {
    bg: "#0c0a04", // warm dark (matches web --background)
    text: "#F4F4F5", // zinc-100
    muted: "#A1A1AA", // zinc-400
    border: "#1f1a10", // warm zinc-800
    panel: "#141108", // warm zinc-900 (matches web zinc-900 override)
    panelSoft: "rgba(20,17,8,0.5)",
    active: "#2c2519", // warm zinc-700
    gold: "#C8973A", // gold-500
    amber: "#F59E0B", // amber-500
    danger: "#DC2626", // red-600
  },
  text: {
    title: {
      fontSize: 26,
      fontWeight: "800" as const,
    },
    label: {
      fontSize: 12,
      fontWeight: "600" as const,
    },
    body: {
      fontSize: 14,
      fontWeight: "600" as const,
    },
    small: {
      fontSize: 13,
      fontWeight: "500" as const,
    },
  },
} as const;

