'use strict';
const assert=require('assert'),crypto=require('crypto'),http=require('http');
process.env.BOQA_API_KEY='synthetic-core001-api-key';
process.env.BOQA_HMAC_SECRET='synthetic-core001-hmac-secret';
process.env.BOQA_RATE_LIMIT='0';
const {server,ctx,shutdown}=require('../server');

function signedHeaders(method,requestPath){
  const ts=String(Math.floor(Date.now()/1000));
  const sig=crypto.createHmac('sha256',process.env.BOQA_HMAC_SECRET).update(method+requestPath+ts,'utf8').digest('hex');
  return {'X-API-Key':process.env.BOQA_API_KEY,'X-BOQA-Ts':ts,'X-BOQA-Sig':sig};
}
function request(port,requestPath,headers={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:requestPath,method:'GET',headers},res=>{
      let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
    });req.on('error',reject);req.end();
  });
}

(async()=>{
  assert(ctx.cuore&&ctx.cuore.humanGateBus,'server must expose HumanGateBus');
  const gate=ctx.cuore.humanGateBus.request({
    operation_id:'server-read-fixture-op',
    reason_code:'SCOPE_AMBIGUOUS',
    human_question:'Review synthetic operation?',
    evidence_refs:['ev:server-read'],
    proposed_action:'research_metadata',
    risk_class:'A3',
    deadline:'2099-01-01T00:00:00.000Z',
    now:()=> '2026-09-25T02:00:00.000Z',
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,path='/api/private/human-gates';
  const unauthorized=await request(port,path);
  assert.equal(unauthorized.status,401);
  const authorized=await request(port,path,signedHeaders('GET',path));
  assert.equal(authorized.status,200);
  const payload=JSON.parse(authorized.body);
  assert(payload.gates.some(g=>g.gate_id===gate.gate_id&&g.status==='PENDING'));
  ctx.cuore.humanGateBus.setReadSurfaceAvailable(false);
  const failedRead=await request(port,path,signedHeaders('GET',path));
  assert.equal(failedRead.status,503);
  assert.equal(ctx.cuore.humanGateBus.isOperationPaused('server-read-fixture-op'),true);
  await shutdown('CORE001_TEST');
  console.log('HumanGate protected read interface: PASS');
})().catch(async(error)=>{console.error(error);try{await shutdown('CORE001_TEST_ERROR');}catch(_){}process.exit(1);});
