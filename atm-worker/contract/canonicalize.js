const crypto=require('crypto');
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function canonicalJson(v){return JSON.stringify(stable(v));}
function sha256(v){return crypto.createHash('sha256').update(v).digest('hex');}
function scopeMaterial(j){const k=['target_repository','target_base_sha','allowed_paths','required_capabilities','frozen_acceptance_criteria','structured_requirements','expected_deliverable','deterministic_checks','max_spend_usd','network_policy','runtime_profile'];return Object.fromEntries(k.map(x=>[x,j[x]]));}
function computeScopeHash(j){return sha256(canonicalJson(scopeMaterial(j)));}
module.exports={stable,canonicalJson,sha256,scopeMaterial,computeScopeHash};
