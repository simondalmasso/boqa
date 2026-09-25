'use strict';

const fs=require('fs'),path=require('path');
const {canonicalDigest,canonicalJson,DecisionKernel,createOperationState}=require('./core');
const {HUMAN_GATE_REASONS}=require('./human-gate');

const AGENT_MARKET_INTERVAL_MS=3600000;
const BUG_BOUNTY_INTERVAL_MS=7200000;

function standardOpportunity(raw,source,sourceId,title,url,kind,status,rewardMin,rewardMax,currency,deadline,scopeSummary,policyUrl,regions,payoutRail,kyc,automation,freshness){
  return {source,source_id:String(sourceId),title:String(title),url:String(url),kind:String(kind),status:String(status),reward_min:Number(rewardMin||0),reward_max:Number(rewardMax??rewardMin??0),currency:String(currency||'USD'),deadline:deadline||null,scope_summary:scopeSummary,policy_url:policyUrl,eligibility_regions:Array.isArray(regions)?regions:[],payout_rail:payoutRail||null,kyc_requirement:kyc||'unknown',automation_policy:automation||'unknown',freshness:freshness||'unknown',source_digest:canonicalDigest(raw)};
}

function adaptFixture(kind,data){
  if(kind==='agent_market')return (data.tasks||[]).map(task=>({opportunity:standardOpportunity(task,data.source||'agent-market-fixture',task.task_id,task.title,task.url,task.kind||'paid_task',task.status,task.reward?.amount,task.reward?.amount,task.reward?.currency,task.deadline,task.scope_summary,task.policy_url,task.eligibility_regions,task.payout_rail,task.kyc_requirement,task.automation_policy,task.freshness),policy_manifest:task.policy}));
  if(kind==='conventional_bounty')return (data.programs||[]).map(program=>({opportunity:standardOpportunity(program,data.source||'conventional-bounty-fixture',program.program_id,program.name,program.page,'bug_bounty',program.status,program.bounty_min,program.bounty_max,program.currency,program.deadline,program.scope,program.policy_url,program.regions,program.payout,program.kyc,program.automation,program.freshness),policy_manifest:program.policy}));
  if(kind==='web3_bounty')return (data.bounties||[]).map(bounty=>({opportunity:standardOpportunity(bounty,data.source||'web3-bounty-fixture',bounty.bounty_id,bounty.name,bounty.link,'web3_bug_bounty',bounty.status,bounty.reward_floor,bounty.max_reward,bounty.currency,bounty.deadline,bounty.scope,bounty.policy_url,bounty.regions,bounty.payout_rail,bounty.kyc,bounty.automation,bounty.freshness),policy_manifest:bounty.policy}));
  throw Object.assign(new Error('RADAR_FIXTURE_KIND_UNSUPPORTED'),{code:'RADAR_FIXTURE_KIND_UNSUPPORTED'});
}

function canonicalOpportunityKey(opportunity){return canonicalDigest({kind:opportunity.kind,title:opportunity.title.trim().toLowerCase(),url:opportunity.url});}
function intervalFor(kind){return kind==='agent_market'?AGENT_MARKET_INTERVAL_MS:BUG_BOUNTY_INTERVAL_MS;}
function initialState(){return {schema_version:1,source_digests:{},source_last_polled:{},opportunities:{},decision_traces:[],target_asset_network_requests:0,updated_at:null};}

class RadarState{
  constructor({filePath}){this.filePath=filePath;}
  load(){if(!fs.existsSync(this.filePath))return initialState();return {...initialState(),...JSON.parse(fs.readFileSync(this.filePath,'utf8'))};}
  save(value){fs.mkdirSync(path.dirname(this.filePath),{recursive:true});const tmp=this.filePath+'.'+process.pid+'.tmp',ordered=JSON.parse(canonicalJson(value));fs.writeFileSync(tmp,JSON.stringify(ordered,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,this.filePath);return value;}
}

class RadarEngine{
  constructor({state,kernel=new DecisionKernel(),humanGateBus=null,outcomeMemory=null}){this.state=state;this.kernel=kernel;this.humanGateBus=humanGateBus;this.outcomeMemory=outcomeMemory;}
  dueSourceKinds(now=Date.now()){
    const state=this.state.load(),known=['agent_market','conventional_bounty','web3_bounty'];
    return known.filter(kind=>{const last=state.source_last_polled[kind];return !last||Number(now)-Date.parse(last)>=intervalFor(kind);});
  }
  scanFixtures(sources,{now=Date.now(),force=false,capabilitySnapshot={},economicInputs={}}={}){
    const current=this.state.load(),at=new Date(Number(now)).toISOString(),due=new Set(this.dueSourceKinds(now)),adapted=[],changedKinds=new Set(),sourceDigests={...current.source_digests},lastPolled={...current.source_last_polled};
    for(const source of sources){
      if(!force&&!due.has(source.kind))continue;
      const digest=canonicalDigest(source.data);
      if(current.source_digests[source.kind]!==digest)changedKinds.add(source.kind);
      sourceDigests[source.kind]=digest;lastPolled[source.kind]=at;
      adapted.push(...adaptFixture(source.kind,source.data).map(x=>({...x,source_kind:source.kind})));
    }
    if(adapted.length===0)return {raw_opportunities:0,unique_opportunities:Object.keys(current.opportunities).length,decisions_run:0,decisions:[],target_asset_network_requests:0,economic_inputs:economicInputs};

    const unique=new Map();
    for(const item of adapted){const key=canonicalOpportunityKey(item.opportunity);if(!unique.has(key))unique.set(key,{...item,canonical_key:key});}
    const opportunities={...current.opportunities},traces=[...(current.decision_traces||[])],decisions=[];let decisionsRun=0;
    for(const item of unique.values()){
      const econ={...economicInputs,expected_payout:Number.isFinite(Number(economicInputs.expected_payout))?Number(economicInputs.expected_payout):(item.opportunity.reward_min+item.opportunity.reward_max)/2};
      const decisionInputDigest=canonicalDigest({opportunity:item.opportunity,policy_manifest:item.policy_manifest,capability_snapshot:capabilitySnapshot,economic_inputs:econ});
      const previous=opportunities[item.canonical_key];
      if(!previous||previous.decision_input_digest!==decisionInputDigest){
        const decision=this.kernel.decide({opportunity:item.opportunity,policy_manifest:item.policy_manifest,capability_snapshot:capabilitySnapshot,economic_inputs:econ,historical_calibration_snapshot:this.outcomeMemory?.calibrationStats?.()||{}});
        decisionsRun++;decisions.push(decision);
        const trace={trace_id:'trace_'+canonicalDigest({key:item.canonical_key,decisionInputDigest,at}).slice(0,20),canonical_key:item.canonical_key,decision_input_digest:decisionInputDigest,decision:decision.decision,source_digest:item.opportunity.source_digest,policy_digest:decision.policy_digest,decided_at:decision.decided_at};
        traces.push(trace);
        opportunities[item.canonical_key]={opportunity:item.opportunity,policy_manifest:item.policy_manifest,decision_input_digest:decisionInputDigest,last_decision:decision,last_trace_id:trace.trace_id};
        if(decision.decision==='HUMAN_AUTHORIZE'&&this.humanGateBus){
          const operation=createOperationState({source:item.opportunity.source,opportunity:item.opportunity,policy_manifest:item.policy_manifest,capability_snapshot:capabilitySnapshot,decision,now:()=>at});
          if(!this.humanGateBus.isOperationPaused(operation.operation_id)){
            const first=decision.blockers[0],reason=HUMAN_GATE_REASONS.includes(first)?first:'SCOPE_AMBIGUOUS';
            this.humanGateBus.request({operation_id:operation.operation_id,reason_code:reason,human_question:'Human authorization required for '+item.opportunity.title,evidence_refs:[trace.trace_id],proposed_action:decision.next_safe_step,risk_class:'A3',deadline:item.opportunity.deadline||at,now:()=>at});
          }
        }
      }
    }
    const next={...current,source_digests:sourceDigests,source_last_polled:lastPolled,opportunities,decision_traces:traces.slice(-200),target_asset_network_requests:0,updated_at:at};
    this.state.save(next);
    return {raw_opportunities:adapted.length,unique_opportunities:unique.size,decisions_run:decisionsRun,decisions,target_asset_network_requests:0,economic_inputs:economicInputs};
  }
}

module.exports={AGENT_MARKET_INTERVAL_MS,BUG_BOUNTY_INTERVAL_MS,adaptFixture,canonicalOpportunityKey,RadarState,RadarEngine};
