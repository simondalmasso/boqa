'use strict';

const crypto=require('crypto'),fs=require('fs'),path=require('path');

const OPPORTUNITY_FIELDS=Object.freeze(['source','source_id','title','url','kind','status','reward_min','reward_max','currency','deadline','scope_summary','policy_url','eligibility_regions','payout_rail','kyc_requirement','automation_policy','freshness','source_digest']);
const POLICY_FIELDS=Object.freeze(['platform','program_id','policy_url','policy_hash','scope_hash','safe_harbor','automation_allowed','automation_rate_limit','allowed_test_classes','prohibited_test_classes','account_rules','data_handling_rules','disclosure_rules','submission_channel','ai_submission_rules','kyc_requirement','payout_terms','verified_at','expires_at']);
const ALLOWED_DECISIONS=Object.freeze(['WATCH','RESEARCH','SKIP','HUMAN_AUTHORIZE']);
const OUTCOME_FIELDS=Object.freeze(['opportunity_digest','decision','predicted_fit','predicted_expected_net','policy_digest','skills_used','result','human_gate_result','submission_result','settlement_result','latency','cost']);
const SKILL_FIELDS=Object.freeze(['skill_id','purpose','source','source_version_or_sha','license','review_status','capability_class','network_permission','mutation_permission','required_secrets','deterministic_tests','last_reviewed','supersedes']);
const PAYOUT_FIELDS=Object.freeze(['asset','network','public_address','memo_or_tag_if_required','provider','verified_at','active']);
const FORBIDDEN_PAYOUT_KEYS=new Set(['private_key','seed_phrase','exchange_password','api_secret','API_secret','provider_user_id','owner_exchange_account_id']);

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function canonicalJson(value){return JSON.stringify(stable(value));}
function canonicalDigest(value){return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');}
function iso(now){const value=typeof now==='function'?now():now;return typeof value==='string'?new Date(value).toISOString():new Date(value===undefined?Date.now():value).toISOString();}
function hasFields(value,fields){return Boolean(value&&typeof value==='object'&&fields.every(k=>Object.prototype.hasOwnProperty.call(value,k)));}
function validateOpportunity(value){const errors=[];if(!hasFields(value,OPPORTUNITY_FIELDS))errors.push('MISSING_FIELDS');if(value&&(!Array.isArray(value.eligibility_regions)||!value.source_digest))errors.push('INVALID_OPPORTUNITY');return {valid:errors.length===0,errors};}
function validateProgramPolicyManifest(value){const errors=[];if(!hasFields(value,POLICY_FIELDS))errors.push('MISSING_FIELDS');if(value&&(!Array.isArray(value.allowed_test_classes)||!Array.isArray(value.prohibited_test_classes)))errors.push('INVALID_TEST_CLASSES');if(value&&(!Number.isFinite(Number(value.automation_rate_limit))&&value.automation_rate_limit!==null))errors.push('INVALID_RATE_LIMIT');return {valid:errors.length===0,errors};}

class EconomicScorer{
  static score(input={}){
    const p=Number(input.payout_probability||0),payout=Number(input.expected_payout||0),compute=Number(input.compute_cost||0),tools=Number(input.paid_tool_cost||0),chain=Number(input.chain_fee||0),human=Number(input.expected_human_cost||0),dispute=Number(input.dispute_risk_reserve||0);
    const gross=p*payout,expected_net=gross-compute-tools-chain-human-dispute;
    return {expected_net,terms:{payout_probability:p,expected_payout:payout,gross_expected_payout:gross,compute_cost:compute,paid_tool_cost:tools,chain_fee:chain,expected_human_cost:human,dispute_risk_reserve:dispute}};
  }
}

class DecisionKernel{
  constructor({minimumExpectedNet=0,now=Date.now}={}){this.minimumExpectedNet=Number(minimumExpectedNet);this.now=now;}
  _result(input,{decision,fit=0,expected_net=null,confidence='LOW',blockers=[],reasons=[],next='none',policyDigest=null}){
    return {decision,fit_score:fit,expected_net,confidence_band:confidence,blockers,reasons,next_safe_step:next,policy_digest:policyDigest,source_digest:input.opportunity?.source_digest||null,decided_at:iso(this.now),target_asset_network_requests:0};
  }
  decide(input={}){
    const opportunity=input.opportunity,policy=input.policy_manifest,cap=input.capability_snapshot||{},econInput=input.economic_inputs||{};
    if(!validateOpportunity(opportunity).valid||!policy||!validateProgramPolicyManifest(policy).valid||!opportunity?.scope_summary?.scope_hash){
      return this._result(input,{decision:'HUMAN_AUTHORIZE',blockers:['POLICY_OR_SCOPE_INCOMPLETE'],reasons:['scope_or_policy_requires_human_review'],next:'request_human_scope_review'});
    }
    const policyDigest=canonicalDigest(policy);
    if(cap.authorized_policy_digest&&cap.authorized_policy_digest!==policyDigest)return this._result(input,{decision:'HUMAN_AUTHORIZE',policyDigest,blockers:['POLICY_CHANGED'],reasons:['prior_authorization_digest_no_longer_matches'],next:'refresh_policy_and_request_human_review'});
    if(Date.parse(policy.expires_at)<=this.now())return this._result(input,{decision:'HUMAN_AUTHORIZE',policyDigest,blockers:['POLICY_CHANGED'],reasons:['policy_expired'],next:'refresh_policy'});
    if(opportunity.scope_summary.admission==='OUT_OF_SCOPE'||opportunity.scope_summary.scope_hash!==policy.scope_hash)return this._result(input,{decision:'SKIP',policyDigest,blockers:['OUT_OF_SCOPE'],reasons:['scope_admission_failed'],next:'none'});
    if(policy.automation_allowed===false)return this._result(input,{decision:'SKIP',policyDigest,blockers:['AUTOMATION_NOT_ALLOWED'],reasons:['program_policy_denies_automation'],next:'none'});
    if(policy.automation_allowed!==true)return this._result(input,{decision:'HUMAN_AUTHORIZE',policyDigest,blockers:['AUTOMATION_PERMISSION_UNKNOWN'],reasons:['automation_permission_unknown'],next:'request_human_policy_review'});
    if(!Number.isFinite(Number(policy.automation_rate_limit)))return this._result(input,{decision:'HUMAN_AUTHORIZE',policyDigest,blockers:['RATE_LIMIT_UNKNOWN'],reasons:['automation_rate_limit_unknown'],next:'request_human_policy_review'});
    const testClass=opportunity.scope_summary.test_class;
    if(policy.prohibited_test_classes.includes(testClass)||!policy.allowed_test_classes.includes(testClass))return this._result(input,{decision:'SKIP',policyDigest,blockers:['OUT_OF_SCOPE'],reasons:['test_class_not_admitted'],next:'none'});
    const required=opportunity.scope_summary.required_capabilities||[],ready=new Set(cap.ready_capabilities||[]),matched=required.filter(x=>ready.has(x)).length,fit=required.length?matched/required.length:1;
    if(matched!==required.length)return this._result(input,{decision:'HUMAN_AUTHORIZE',fit,policyDigest,blockers:['UNSUPPORTED_CAPABILITY'],reasons:['required_capability_missing'],next:'select_supported_worker_or_human'});
    const regions=opportunity.eligibility_regions||[];if(regions.length&&!regions.includes('GLOBAL')&&!regions.includes(cap.region))return this._result(input,{decision:'SKIP',fit,policyDigest,blockers:['REGION_INELIGIBLE'],reasons:['region_not_eligible'],next:'none'});
    if(opportunity.kyc_requirement==='required'||policy.kyc_requirement==='required')return this._result(input,{decision:'HUMAN_AUTHORIZE',fit,policyDigest,blockers:['KYC_REQUIRED'],reasons:['kyc_requires_human_authority'],next:'request_human_kyc'});
    if(!opportunity.payout_rail||!policy.payout_terms?.verified)return this._result(input,{decision:'HUMAN_AUTHORIZE',fit,policyDigest,blockers:['PAYOUT_TERMS_CHANGED'],reasons:['payout_terms_not_verified'],next:'verify_payout_terms'});
    if(opportunity.status!=='open')return this._result(input,{decision:'SKIP',fit,policyDigest,blockers:['OPPORTUNITY_NOT_OPEN'],reasons:['opportunity_not_open'],next:'none'});
    if(opportunity.freshness!=='fresh')return this._result(input,{decision:'WATCH',fit,policyDigest,reasons:['source_not_fresh'],next:'wait_for_fresh_source'});
    const economic=EconomicScorer.score(econInput),threshold=Number.isFinite(Number(econInput.minimum_expected_net))?Number(econInput.minimum_expected_net):this.minimumExpectedNet;
    if(economic.expected_net<threshold)return this._result(input,{decision:'SKIP',fit,expected_net:economic.expected_net,policyDigest,blockers:['EXPECTED_NET_BELOW_POLICY_THRESHOLD'],reasons:['economic_threshold_not_met'],next:'none'});
    return this._result(input,{decision:'RESEARCH',fit,expected_net:economic.expected_net,confidence:'HIGH',policyDigest,reasons:['hard_gates_pass','no_auto_action_in_core001'],next:'research_metadata_or_local_analysis'});
  }
}

function createOperationState({source,opportunity,policy_manifest,capability_snapshot,decision,now=Date.now}){
  const at=iso(now),policy_digest=policy_manifest?canonicalDigest(policy_manifest):null,scope_digest=canonicalDigest(opportunity.scope_summary||null),capability_snapshot_digest=canonicalDigest(capability_snapshot||{});
  return {operation_id:'op_'+canonicalDigest({source,opportunity_id:opportunity.source_id,source_digest:opportunity.source_digest,policy_digest}).slice(0,20),source,opportunity_id:opportunity.source_id,state:decision.decision==='HUMAN_AUTHORIZE'?'PAUSED_HUMAN_GATE':decision.decision==='SKIP'?'SKIPPED':decision.decision==='WATCH'?'WATCHING':'RESEARCHING',created_at:at,updated_at:at,policy_digest,scope_digest,capability_snapshot_digest,decision:decision.decision,human_gate_id_or_null:null,evidence_refs:[],settlement_status:'NOT_SUBMITTED'};
}

class OutcomeMemory{
  constructor({filePath}){this.filePath=filePath;}
  append(record){const errors=OUTCOME_FIELDS.filter(k=>!Object.prototype.hasOwnProperty.call(record,k));if(errors.length)throw Object.assign(new Error('OUTCOME_FIELDS_REQUIRED'),{code:'OUTCOME_FIELDS_REQUIRED'});fs.mkdirSync(path.dirname(this.filePath),{recursive:true});const at=iso(record.now||Date.now),payload=Object.fromEntries(OUTCOME_FIELDS.map(k=>[k,record[k]]));payload.verified=record.verified===true;payload.recorded_at=at;payload.record_digest=canonicalDigest(payload);fs.appendFileSync(this.filePath,JSON.stringify(payload)+'\n',{mode:0o600});return payload;}
  records(){if(!fs.existsSync(this.filePath))return[];return fs.readFileSync(this.filePath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}
  calibrationStats(){const rows=this.records(),verified=rows.filter(r=>r.verified===true);return {verified_count:verified.length,unverified_count:rows.length-verified.length,total_count:rows.length,mean_verified_cost:verified.length?verified.reduce((n,r)=>n+Number(r.cost||0),0)/verified.length:0};}
}

function validatePayoutRegistryEntry(entry){const errors=[];if(!hasFields(entry,PAYOUT_FIELDS))errors.push('MISSING_FIELDS');for(const k of Object.keys(entry||{}))if(FORBIDDEN_PAYOUT_KEYS.has(k))errors.push('FORBIDDEN_SECRET_OR_ACCOUNT_IDENTIFIER');if(!entry?.asset||!entry?.network||typeof entry?.public_address!=='string'||!entry.public_address.trim())errors.push('RECEIVE_ADDRESS_REQUIRED');if(/^(?:user|account|acct|uid|customer|exchange)[_:\-.]/i.test(entry?.public_address||''))errors.push('PAYOUT_ADDRESS_LOOKS_LIKE_ACCOUNT_ID');return {valid:errors.length===0,errors};}

function nativeSkillEntries(){
  const base={source:'BOQA_NATIVE',source_version_or_sha:'f734e229f442d83a873cd473a929883a846ec8c6',license:'MIT',review_status:'APPROVED',mutation_permission:'none',required_secrets:[],deterministic_tests:['PR49_ACCEPTED'],last_reviewed:'2026-09-25',supersedes:null};
  return [
    {...base,skill_id:'browser-reproduction',purpose:'controlled browser reproduction',capability_class:'browser-reproduction',network_permission:'explicit_allowlist_only'},
    {...base,skill_id:'evidence-verification',purpose:'verify evidence and hashes',capability_class:'evidence-verification',network_permission:'none'},
    {...base,skill_id:'scope-authorization',purpose:'deterministic scope admission',capability_class:'scope-authorization',network_permission:'none'},
    {...base,skill_id:'deterministic-replay',purpose:'replay accepted evidence deterministically',capability_class:'deterministic-replay',network_permission:'none'},
  ];
}
function validateSkillRegistryEntry(entry){const errors=[];if(!hasFields(entry,SKILL_FIELDS))errors.push('MISSING_FIELDS');if(!Array.isArray(entry?.required_secrets)||!Array.isArray(entry?.deterministic_tests))errors.push('INVALID_SKILL_FIELDS');return {valid:errors.length===0,errors};}
function admitSkill(entry,requested={}){const v=validateSkillRegistryEntry(entry);if(!v.valid)return {allowed:false,reasons:v.errors};const reasons=[];if(entry.review_status!=='APPROVED')reasons.push('SKILL_NOT_REVIEWED');if(requested.network_permission&&requested.network_permission!==entry.network_permission)reasons.push('UNDECLARED_NETWORK_PERMISSION');if(requested.mutation_permission&&requested.mutation_permission!==entry.mutation_permission)reasons.push('UNDECLARED_MUTATION_PERMISSION');return {allowed:reasons.length===0,reasons};}

module.exports={OPPORTUNITY_FIELDS,POLICY_FIELDS,ALLOWED_DECISIONS,canonicalJson,canonicalDigest,validateOpportunity,validateProgramPolicyManifest,EconomicScorer,DecisionKernel,createOperationState,OutcomeMemory,validatePayoutRegistryEntry,nativeSkillEntries,validateSkillRegistryEntry,admitSkill};
