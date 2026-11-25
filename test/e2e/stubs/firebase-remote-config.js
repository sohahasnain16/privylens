export const getRemoteConfig = () => (window.__rc ||= { settings: {}, defaultConfig: {}, fetched: false });
export const fetchAndActivate = async (rc) => { rc.fetched = true; return true; };
export const getValue = (rc, key) => {
  const ov = window.__rcOverrides || {};
  const remote = rc.fetched && key in ov;
  const raw = remote ? ov[key] : rc.defaultConfig[key];
  const s = raw == null ? "" : String(raw);
  return { asString: () => s, asNumber: () => Number(s), asBoolean: () => ["true", "1", "t", "yes"].includes(s.toLowerCase()), getSource: () => (remote ? "remote" : "default") };
};
