from __future__ import annotations
import hashlib, json, os
from pathlib import Path
from typing import Any

ROUTES={"original","v2","export","nested","query"}
VERDICTS={"REPRODUCED","NOT_REPRODUCED","AMBIGUOUS"}

def canonical(o:Any)->bytes:
    return json.dumps(o,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
def sha_bytes(b:bytes)->str: return hashlib.sha256(b).hexdigest()
def sha_file(p:Path)->str: return sha_bytes(p.read_bytes())
def load_json(p:Path)->dict[str,Any]: return json.loads(p.read_text())

def adapt_seed(path:Path)->dict[str,Any]:
    raw=load_json(path)
    if raw.get("schema")!="boqa.strict-finding.v1": raise ValueError("invalid seed schema")
    route=raw.get("candidate_route")
    if route not in ROUTES: raise ValueError("unrecognized route")
    claim=raw.get("claim")
    if not isinstance(claim,dict) or not claim.get("owner_marker"): raise ValueError("insufficient claim")
    candidate={"route":route,"owner_marker":claim["owner_marker"],"resource_id":str(claim.get("resource_id","")),"source_sha256":sha_file(path),"provenance":"strict_finding_untrusted_seed"}
    candidate["candidate_sha256"]=sha_bytes(canonical(candidate))
    return candidate

def reproduce(candidate:dict[str,Any], lab_path:Path)->dict[str,Any]:
    lab=load_json(lab_path)
    if lab.get("schema")!="boqa.controlled-lab.v1" or lab.get("route")!=candidate["route"]: raise ValueError("lab/candidate mismatch")
    receipt={"candidate_sha256":candidate["candidate_sha256"],"lab_sha256":sha_file(lab_path),"route":candidate["route"],"owner_control":lab.get("owner_control"),"outsider_probe":lab.get("outsider_probe"),"network_boundary":"fixture_only_no_network"}
    receipt["receipt_sha256"]=sha_bytes(canonical(receipt))
    return receipt

def semantic_oracle(candidate:dict[str,Any], receipt:dict[str,Any])->tuple[str,str]:
    owner=receipt.get("owner_control") or {}; outsider=receipt.get("outsider_probe") or {}
    marker=candidate["owner_marker"]
    owner_sem=(owner.get("status")==200 and isinstance(owner.get("semantic"),dict) and owner["semantic"].get("marker")==marker)
    if not owner_sem: return "AMBIGUOUS","owner_control_not_semantically_proven"
    sem=outsider.get("semantic")
    if outsider.get("status")==200 and isinstance(sem,dict) and sem.get("marker")==marker:
        return "REPRODUCED","outsider_received_prohibited_owner_marker"
    if outsider.get("status") in (401,403,404):
        return "NOT_REPRODUCED","outsider_definitively_denied_in_controlled_reproduction"
    return "AMBIGUOUS","outsider_response_does_not_semantically_prove_or_disprove_claim"

def emit_regression(case_dir:Path,candidate:dict[str,Any])->Path:
    p=case_dir/"standalone_regression.py"
    marker=json.dumps(candidate["owner_marker"])
    p.write_text(f'''import json, os, sys\nfrom pathlib import Path\np=Path(os.environ["BOQA006_OBSERVED_FILE"])\nd=json.loads(p.read_text())\nsem=(d.get("outsider_probe") or {{}}).get("semantic")\nif isinstance(sem,dict) and sem.get("marker")=={marker}:\n    raise SystemExit("regression failed: prohibited owner marker disclosed")\nprint("PASS")\n''')
    return p

def run_case(case_id:str,seed_path:Path,lab_path:Path,out_root:Path)->dict[str,Any]:
    case_dir=out_root/case_id; case_dir.mkdir(parents=True,exist_ok=True)
    candidate=adapt_seed(seed_path); receipt=reproduce(candidate,lab_path); verdict,basis=semantic_oracle(candidate,receipt)
    (case_dir/"candidate.json").write_text(json.dumps(candidate,indent=2,sort_keys=True)+"\n")
    (case_dir/"reproduction.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n")
    reg=None
    if verdict=="REPRODUCED": reg=emit_regression(case_dir,candidate)
    result={"case":case_id,"verdict":verdict,"basis":basis,"seed_sha256":sha_file(seed_path),"candidate_sha256":candidate["candidate_sha256"],"reproduction_sha256":receipt["receipt_sha256"],"regression_generated":bool(reg),"regression_sha256":sha_file(reg) if reg else None}
    (case_dir/"result.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    return result
