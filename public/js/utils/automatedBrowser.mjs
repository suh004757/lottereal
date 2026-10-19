// Playwright/Puppeteer QA runs set navigator.webdriver; their visits inflated view_count,
// which is the consent-free measure of real readers.
export function isAutomatedBrowser(nav = globalThis.navigator) {
  return nav?.webdriver === true;
}
