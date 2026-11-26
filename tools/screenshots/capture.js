import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { chromium } from 'playwright';

const schema = JSON.parse(await readFile(new URL('./schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

export function validateConfig(config) {
  if (!validate(config)) throw new Error(`Invalid screenshot configuration: ${JSON.stringify(validate.errors)}`);
  const names = config.pages.map(page => page.name);
  if (new Set(names).size !== names.length) throw new Error('Screenshot names must be unique.');
  return config;
}

export function pageUrl(baseUrl, path) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash) {
    throw new Error('The base URL must use HTTP or HTTPS and cannot contain a query or fragment.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const url = new URL(path.slice(1), base);
  if (url.origin !== base.origin) throw new Error('Page paths must use the base URL origin.');
  return url;
}

export async function capture(config, baseUrl, outputDirectory) {
  validateConfig(config);
  pageUrl(baseUrl, '/');
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const definition of config.pages) {
      const url = pageUrl(baseUrl, definition.path);
      const context = await browser.newContext({ viewport: definition.viewport ?? { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        const response = await page.goto(url.href, { waitUntil: 'load' });
        if (response && !response.ok()) throw new Error(`${url.href} returned HTTP ${response.status()}.`);
        if (definition.waitFor) await page.locator(definition.waitFor).first().waitFor({ state: 'visible' });
        for (const step of definition.steps ?? []) {
          const target = page.locator(step.selector).first();
          if (step.action === 'click') await target.click();
          if (step.action === 'fill') await target.fill(step.value);
          if (step.action === 'press') await target.press(step.key);
          if (step.action === 'waitFor') await target.waitFor({ state: 'visible' });
        }
        await page.screenshot({ path: join(outputDirectory, `${definition.name}.png`), fullPage: definition.fullPage ?? false, animations: 'disabled' });
        console.log(`Captured ${definition.name}.png`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [configPath, baseUrl, outputDirectory] = process.argv.slice(2);
  if (!configPath || !baseUrl || !outputDirectory) throw new Error('Usage: node capture.js <config.json> <base-url> <output-directory>');
  await capture(JSON.parse(await readFile(configPath, 'utf8')), baseUrl, outputDirectory);
}
