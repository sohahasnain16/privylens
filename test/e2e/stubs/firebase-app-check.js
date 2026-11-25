export class ReCaptchaV3Provider { constructor(k) { this.k = k; } }
export class ReCaptchaEnterpriseProvider { constructor(k) { this.k = k; } }
export const initializeAppCheck = (app, opts) => { (window.__appCheck ||= []).push(opts); return { opts }; };
