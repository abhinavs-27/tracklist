/**
 * Makes `require("server-only")` / resolution load an empty module so tsx/Node can
 * execute server job modules outside Next.js (e.g. BullMQ worker).
 */
const Module = require("node:module");
const path = require("node:path");

const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "server-only-stub.cjs");
  }
  return orig.call(this, request, parent, isMain, options);
};
