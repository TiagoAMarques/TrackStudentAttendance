import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const standalone = resolve('.next/standalone');
if (!existsSync(resolve(standalone, 'server.js'))) throw new Error('Standalone server not found. Run the university build first.');
mkdirSync(resolve(standalone, '.next'), { recursive: true });
cpSync(resolve('.next/static'), resolve(standalone, '.next/static'), { recursive: true });
if (existsSync(resolve('public'))) cpSync(resolve('public'), resolve(standalone, 'public'), { recursive: true });
console.log(`University release prepared in ${standalone}`);
