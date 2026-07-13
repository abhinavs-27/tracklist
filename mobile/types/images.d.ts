// Ambient module declarations for static image assets bundled via Metro.
// Needed so `import icon from "./icon.png"` (used instead of `require(...)`,
// which ESLint's no-require-imports rule forbids) type-checks.
declare module "*.png" {
  const value: import("react-native").ImageSourcePropType;
  export default value;
}

declare module "*.jpg" {
  const value: import("react-native").ImageSourcePropType;
  export default value;
}

declare module "*.jpeg" {
  const value: import("react-native").ImageSourcePropType;
  export default value;
}

declare module "*.gif" {
  const value: import("react-native").ImageSourcePropType;
  export default value;
}
