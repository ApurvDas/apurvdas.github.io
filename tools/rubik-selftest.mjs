// node tools/rubik-selftest.mjs : the cube logic self-check (same one as `__rm.rubik.selftest()` under ?debug)
import { selftest } from '../rubik-core.js';
console.log(selftest() ? 'rubik selftest ok' : 'failed');
