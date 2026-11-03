import { writeFileSync } from 'node:fs';
import { generateCss } from '../src/tokens/tokens.ts';

writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), generateCss());
