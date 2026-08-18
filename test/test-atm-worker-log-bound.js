const assert=require('assert');
const {LOG_MAX_BYTES,assertLogBound}=require('../atm-worker/runtime/process-runner');
assert.equal(LOG_MAX_BYTES,10*1024*1024);
assert(assertLogBound('ok','ok'));
assert.throws(()=>assertLogBound('x'.repeat(LOG_MAX_BYTES+1),''),e=>e.code==='LOG_TOO_LARGE');
console.log('ATM worker log bound: PASS');
