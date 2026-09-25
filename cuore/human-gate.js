'use strict';

const fs=require('fs'),path=require('path');
const {canonicalDigest}=require('./core');

const HUMAN_GATE_REASONS=Object.freeze([
  'SCOPE_AMBIGUOUS','POLICY_CHANGED','AUTOMATION_PERMISSION_UNKNOWN','RATE_LIMIT_UNKNOWN',
  'STATE_CHANGING_TEST','DESTRUCTIVE_OR_HIGH_IMPACT_TEST','NEW_CREDENTIAL_OR_ACCOUNT_REQUIRED',
  'REAL_PRIVATE_DATA_ENCOUNTERED','REPORT_SUBMISSION_REQUIRES_HUMAN_REVIEW','KYC_REQUIRED',
  'PAYOUT_TERMS_CHANGED','WALLET_SIGNATURE_REQUIRED','SPEND_REQUIRED','WITHDRAWAL_REQUIRED',
  'TAX_OR_INVOICE_ACTION_REQUIRED','DISPUTE_OR_APPEAL','UNSUPPORTED_CAPABILITY',
  'EXPECTED_NET_BELOW_POLICY_THRESHOLD',
]);

function iso(now){const value=typeof now==='function'?now():now;return new Date(value===undefined?Date.now():value).toISOString();}

class HumanGateBus{
  constructor({filePath,readSurfaceAvailable=true}){this.filePath=filePath;this.readSurfaceAvailable=readSurfaceAvailable;}
  _append(event){fs.mkdirSync(path.dirname(this.filePath),{recursive:true});fs.appendFileSync(this.filePath,JSON.stringify(event)+'\n',{mode:0o600});return event;}
  events(){if(!fs.existsSync(this.filePath))return[];return fs.readFileSync(this.filePath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}
  _current(){
    const map=new Map();
    for(const event of this.events()){
      if(event.type==='human_gate.requested')map.set(event.gate.gate_id,{...event.gate});
      else if(event.gate_id&&map.has(event.gate_id))map.set(event.gate_id,{...map.get(event.gate_id),status:event.status,updated_at:event.at});
    }
    return [...map.values()].sort((a,b)=>a.gate_id.localeCompare(b.gate_id));
  }
  request(input){
    if(!HUMAN_GATE_REASONS.includes(input.reason_code))throw Object.assign(new Error('HUMAN_GATE_REASON_INVALID'),{code:'HUMAN_GATE_REASON_INVALID'});
    const at=iso(input.now),basis={operation_id:input.operation_id,reason_code:input.reason_code,proposed_action:input.proposed_action,deadline:input.deadline,at};
    const gate={gate_id:'gate_'+canonicalDigest(basis).slice(0,20),operation_id:input.operation_id,reason_code:input.reason_code,human_question:input.human_question,evidence_refs:Array.isArray(input.evidence_refs)?input.evidence_refs:[],proposed_action:input.proposed_action,risk_class:input.risk_class,deadline:input.deadline,default_if_no_response:'DENY_OR_PAUSE',resume_token:'resume_'+canonicalDigest({...basis,resume:true}).slice(0,24),status:'PENDING',created_at:at};
    this._append({type:'human_gate.requested',at,gate});
    return gate;
  }
  resolve(gateId,status,{now=Date.now}={}){
    if(!['APPROVED','DENIED'].includes(status))throw Object.assign(new Error('HUMAN_GATE_RESOLUTION_INVALID'),{code:'HUMAN_GATE_RESOLUTION_INVALID'});
    const gate=this._current().find(g=>g.gate_id===gateId);
    if(!gate||gate.status!=='PENDING')throw Object.assign(new Error('HUMAN_GATE_NOT_PENDING'),{code:'HUMAN_GATE_NOT_PENDING'});
    const at=iso(now),type=status==='APPROVED'?'human_gate.approved':'human_gate.denied';
    this._append({type,at,gate_id:gateId,operation_id:gate.operation_id,status});
    return {...gate,status,updated_at:at};
  }
  expire({now=Date.now}={}){
    const currentMs=Date.parse(iso(now)),expired=[];
    for(const gate of this._current().filter(g=>g.status==='PENDING')){
      if(gate.deadline&&Date.parse(gate.deadline)<=currentMs){
        const at=iso(now);this._append({type:'human_gate.expired',at,gate_id:gate.gate_id,operation_id:gate.operation_id,status:'EXPIRED'});expired.push(gate.gate_id);
      }
    }
    return expired;
  }
  isOperationPaused(operationId){return this._current().some(g=>g.operation_id===operationId&&g.status==='PENDING');}
  setReadSurfaceAvailable(value){this.readSurfaceAvailable=Boolean(value);}
  readQueue(){
    if(!this.readSurfaceAvailable)throw Object.assign(new Error('HUMAN_GATE_READ_UNAVAILABLE'),{code:'HUMAN_GATE_READ_UNAVAILABLE'});
    return this._current();
  }
}

module.exports={HUMAN_GATE_REASONS,HumanGateBus};
