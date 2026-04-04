const path = require("path");

const projectRoot = __dirname;

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: [projectRoot],
          alias: {
            "@": projectRoot,
            "@repo": path.resolve(projectRoot, ".."),
          },
          extensions: [
            ".ios.js",
            ".android.js",
            ".js",
            ".jsx",
            ".json",
            ".tsx",
            ".ts",
          ],
        },
      ],
    ],
  };
};
