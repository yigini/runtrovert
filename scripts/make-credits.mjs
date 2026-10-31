// Writes src/credits/libraries.json: the open-source software inside the app,
// with each one's licence and copyright lines, and each licence's text once.
// Run after adding or updating a dependency: npm run credits (needs node_modules).
// npm run test:credits fails when package.json and the file disagree.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

function copyrights(dir) {
  const files = readdirSync(dir).filter((f) => /^licen[cs]e/i.test(f) && !/font/i.test(f));
  const lines = new Set();
  for (const f of files) {
    for (const line of readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
      const l = line.trim();
      if (/^copyright\b/i.test(l) && !/notice/i.test(l)) lines.add(l.replace(/\[|\]/g, ''));
    }
  }
  return [...lines];
}

// What ships from npm: the app's own dependencies. Tools that only build the app are left out.
const libraries = Object.keys(pkg.dependencies).map((name) => {
  const entry = lock.packages[`node_modules/${name}`];
  const meta = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
  // The Google Fonts packages are MIT code around OFL fonts; the fonts have their own credit.
  const licence = entry.license === 'MIT AND OFL-1.1' ? 'MIT' : entry.license;
  const repo = typeof meta.repository === 'string' ? meta.repository : meta.repository?.url;
  const url = meta.homepage ?? repo?.replace(/^git\+/, '').replace(/\.git$/, '') ?? `https://www.npmjs.com/package/${name}`;
  return { name, version: entry.version, licence, copyright: copyrights(`node_modules/${name}`), url };
});

// What ships from Android's side (and the watch app), which npm doesn't list.
const native = [
  { name: 'MapLibre Native', licence: 'BSD-2-Clause', copyright: ['Copyright (c) 2021 MapLibre contributors', 'Copyright (c) 2014-2020 Mapbox'], url: 'https://github.com/maplibre/maplibre-native' },
  { name: 'Hermes', licence: 'MIT', copyright: ['Copyright (c) Meta Platforms, Inc. and affiliates.'], url: 'https://github.com/facebook/hermes' },
  { name: 'Fresco', licence: 'MIT', copyright: ['Copyright (c) Meta Platforms, Inc. and affiliates.'], url: 'https://github.com/facebook/fresco' },
  { name: 'SQLite', licence: 'public-domain', copyright: [], url: 'https://sqlite.org/copyright.html' },
  { name: 'AndroidX (Jetpack, Wear OS, Health Services)', licence: 'Apache-2.0', copyright: ['Copyright The Android Open Source Project'], url: 'https://developer.android.com/jetpack/androidx' },
  { name: 'AndroidX Media3', licence: 'Apache-2.0', copyright: ['Copyright The Android Open Source Project'], url: 'https://github.com/androidx/media' },
  { name: 'Kotlin and kotlinx.coroutines', licence: 'Apache-2.0', copyright: ['Copyright JetBrains s.r.o. and Kotlin Programming Language contributors'], url: 'https://kotlinlang.org' },
  { name: 'OkHttp and Okio', licence: 'Apache-2.0', copyright: ['Copyright Square, Inc.'], url: 'https://square.github.io/okhttp/' },
];

const permissionAfter = (text, start) => text.slice(text.indexOf(start)).trim();
const texts = {
  MIT: permissionAfter(readFileSync('node_modules/react/LICENSE', 'utf8'), 'Permission is hereby granted'),
  'BSD-2-Clause': [
    'Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:',
    '1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.',
    '2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.',
    'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
  ].join('\n\n'),
  'Apache-2.0': readFileSync('node_modules/typescript/LICENSE.txt', 'utf8').split('END OF TERMS AND CONDITIONS')[0].trim(),
  'OFL-1.1': permissionAfter(readFileSync('node_modules/@expo-google-fonts/dm-sans/LICENSE_FONT', 'utf8'), 'SIL OPEN FONT LICENSE'),
};

const fonts = ['dm-sans', 'fraunces'].map((f) => readFileSync(`node_modules/@expo-google-fonts/${f}/LICENSE_FONT`, 'utf8').split('\n')[0].trim());

// One paragraph per line, so the text wraps to the phone instead of the file.
const tidy = (t) => t.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter((l) => !/^-+$/.test(l)).join(' ')).filter(Boolean).join('\n\n');
for (const k of Object.keys(texts)) texts[k] = tidy(texts[k]);

const out = { libraries: [...libraries, ...native], fonts, texts };
writeFileSync('src/credits/libraries.json', JSON.stringify(out, null, 1) + '\n');
console.log(`credits: ${out.libraries.length} libraries, ${Object.keys(texts).length} licence texts`);
