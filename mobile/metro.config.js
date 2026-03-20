const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/** Prefer prebuilt entry so Hermes resolves hooks (e.g. useQueryClient) reliably. */
const reactQueryModern = path.resolve(
  projectRoot,
  "node_modules/@tanstack/react-query/build/modern/index.js",
);

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@tanstack/react-query") {
    return {
      filePath: reactQueryModern,
      type: "sourceFile",
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
