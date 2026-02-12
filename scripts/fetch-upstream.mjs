import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM_URL =
  'https://www.cryptopro.ru/sites/default/files/products/cades/cadesplugin_api.js';
const EXPECTED_VERSION = '2.4.2';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function main() {
  const res = await fetch(UPSTREAM_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch upstream script: ${res.status} ${res.statusText}`);
  }

  const body = await res.text();
  if (!body.includes(`JSModuleVersion = \"${EXPECTED_VERSION}\"`)) {
    throw new Error(
      `Upstream script does not look like JSModuleVersion ${EXPECTED_VERSION}. Refusing to write.`,
    );
  }

  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);
  const root = path.resolve(dirname, '..');
  const outDir = path.join(root, 'upstream');
  await mkdir(outDir, { recursive: true });

  const jsPath = path.join(outDir, `cadesplugin_api.${EXPECTED_VERSION}.js`);
  const sumPath = path.join(outDir, `cadesplugin_api.${EXPECTED_VERSION}.sha256`);

  await writeFile(jsPath, body, 'utf8');
  await writeFile(sumPath, `${sha256(body)}  ${path.basename(jsPath)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${jsPath}`);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${sumPath}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
