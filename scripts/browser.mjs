import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

export function launchBrowser() {
  const executablePath = process.env.BROWSER_PATH || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].find(p => existsSync(p));
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
}
