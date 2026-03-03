// Web-only no-op shim for sentry-expo.
// Keeps imports stable while avoiding native tracing package resolution issues in metro web.
const noop = () => {};

const Browser = {
  addBreadcrumb: noop,
  setUser: noop,
  captureException: noop,
  captureMessage: noop,
};

const Native = {
  addBreadcrumb: noop,
  setUser: noop,
  setContext: noop,
  captureException: noop,
  captureMessage: noop,
};

module.exports = {
  init: noop,
  Native,
  Browser,
};
