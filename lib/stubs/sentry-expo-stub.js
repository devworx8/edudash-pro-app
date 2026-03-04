// Web-only no-op shim for Sentry modules.
// Keeps imports stable while avoiding native tracing package resolution issues in metro web.
const noop = () => undefined;

function createNoopProxy(seed = {}) {
  return new Proxy(seed, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === '__esModule') return true;
      if (prop === 'default') return target;
      return noop;
    },
  });
}

const Browser = createNoopProxy({
  addBreadcrumb: noop,
  setUser: noop,
  captureException: noop,
  captureMessage: noop,
});

const Native = createNoopProxy({
  addBreadcrumb: noop,
  setUser: noop,
  setContext: noop,
  captureException: noop,
  captureMessage: noop,
});

module.exports = createNoopProxy({
  init: noop,
  close: noop,
  flush: noop,
  withScope: (cb) => {
    if (typeof cb === 'function') cb(createNoopProxy());
  },
  configureScope: (cb) => {
    if (typeof cb === 'function') cb(createNoopProxy());
  },
  addBreadcrumb: noop,
  setUser: noop,
  setContext: noop,
  setTag: noop,
  setTags: noop,
  setExtra: noop,
  captureException: noop,
  captureMessage: noop,
  Browser,
  Native,
});
