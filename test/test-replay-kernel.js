'use strict';

const assert=require('assert');
const {DeterministicReplayEngine}=require('../deterministic-replay-engine');
const {ReplaySecurityGuard}=require('../replay-security-guard');
const {redactObject}=require('../universal-session-recorder');
(async()=>{
  const recording={
    started_at:1700000000000,
    context_hash:'lean-kernel-context',
    events:[
      {type:'console_log',timestamp:1700000000000,payload:'one'},
      {type:'console_log',timestamp:1700000000010,payload:'two'},
    ],
    step_boundaries:[],
  };
  const aEngine=new DeterministicReplayEngine({seed:'restore001',normalizeTiming:true});
  const bEngine=new DeterministicReplayEngine({seed:'restore001',normalizeTiming:true});
  aEngine.loadRecording(structuredClone(recording));
  bEngine.loadRecording(structuredClone(recording));
  const a=await aEngine.replay();
  const b=await bEngine.replay();
  const {replayed_at:_aTime,...stableA}=a;
  const {replayed_at:_bTime,...stableB}=b;
  assert.deepEqual(stableA,stableB);

  const guard=new ReplaySecurityGuard({
    signingKey:'11'.repeat(32),
    encryptionKey:'22'.repeat(32),
  });
  const fixture={authorization:'Bearer synthetic-value-1234567890',nested:{access_token:'synthetic-value-abcdefghij'}};
  const redacted=guard.redact(fixture);
  assert.equal(redacted.redaction_summary.no_plaintext_secrets,true);
  const serialized=JSON.stringify(redacted.redacted);
  assert.equal(serialized.includes('synthetic-value-1234567890'),false);
  assert.equal(serialized.includes('synthetic-value-abcdefghij'),false);
  assert.equal(redacted.redaction_summary.total_secrets_found,2);

  const captured=redactObject({password:'synthetic-password',safe:'ok'});
  assert.notEqual(captured.password,'synthetic-password');
  assert.equal(captured.safe,'ok');

  console.log('replay kernel deterministic/redaction: PASS');
})().catch((error)=>{console.error(error);process.exit(1);});
