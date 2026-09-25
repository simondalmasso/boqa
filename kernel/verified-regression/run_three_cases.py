from pathlib import Path
import json, subprocess, sys, os
from pipeline import run_case, sha_file
ROOT=Path(__file__).resolve().parent; OUT=ROOT/"evidence"; OUT.mkdir(exist_ok=True)
res=[]
for c in "ABC": res.append(run_case(c,ROOT/"seeds"/f"case_{c}.json",ROOT/"lab"/f"case_{c}.json",OUT))
# prove standalone A against explicit vulnerable and fixed observations
reg=OUT/"A"/"standalone_regression.py"
def run_obs(name):
    env=os.environ.copy(); env["BOQA006_OBSERVED_FILE"]=str(ROOT/"lab"/name)
    return subprocess.run([sys.executable,str(reg)],env=env,capture_output=True,text=True)
v=run_obs("case_A.json"); f=run_obs("case_A_fixed.json")
manifest={"schema":"boqa006.offline-evidence.v1","github_calls":0,"cases":res,"standalone_A_vulnerable_exit":v.returncode,"standalone_A_fixed_exit":f.returncode,"security":{"network":"fixture_only_no_network","real_sessions":False,"production_mutation":False},"source_hashes":{p.name:sha_file(p) for p in ROOT.glob("*.py")}}
(OUT/"manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
print(json.dumps(manifest,sort_keys=True))
if not (res[0]["verdict"]=="REPRODUCED" and res[0]["regression_generated"] and v.returncode!=0 and f.returncode==0 and res[1]["verdict"]=="NOT_REPRODUCED" and not res[1]["regression_generated"] and res[2]["verdict"]=="AMBIGUOUS" and not res[2]["regression_generated"]): raise SystemExit(1)
