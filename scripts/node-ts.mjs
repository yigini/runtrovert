// Lets plain Node run src/ modules that import each other without extensions
// (the way Metro resolves them):  node --experimental-strip-types --import ./scripts/node-ts.mjs scripts/x.ts
import { register } from 'node:module';
register('./node-ts-resolver.mjs', import.meta.url);
