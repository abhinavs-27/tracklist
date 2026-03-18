export const theme = {
  colors: {
    bg: "#09090B", // zinc-950
    text: "#F4F4F5", // zinc-100
    muted: "#A1A1AA", // zinc-400
    border: "#27272A", // zinc-800
    panel: "#18181B", // zinc-900
    panelSoft: "rgba(24,24,27,0.5)",
    active: "#3F3F46", // zinc-700
    emerald: "#10B981", // emerald-500
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

