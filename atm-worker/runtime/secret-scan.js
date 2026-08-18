const P=[['BEARER',/Bearer\s+[A-Za-z0-9._~+\/-]{12,}/gi],['GITHUB',/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/g],['AWS',/AKIA[0-9A-Z]{16}/g],['PEM',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['WALLET',/\b0x[0-9a-fA-F]{64}\b/g],['AUTH',/Authorization\s*:\s*[^\r\n]+/gi],['COOKIE',/(?:Set-Cookie|Cookie)\s*:\s*[^\r\n]+/gi],['CREDURL',/https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi]];
function findings(t){const s=String(t||'');return P.flatMap(([kind,re])=>[...s.matchAll(re)].map(m=>({kind,index:m.index,length:m[0].length})));}
function redact(t){let s=String(t||'');for(const [,re] of P)s=s.replace(re,'[REDACTED]');return s;}
function assertClean(t){const f=findings(t);if(f.length)throw Object.assign(new Error('SECRET_MATERIAL_DETECTED'),{code:'SECRET_MATERIAL_DETECTED',findings:f});return true;}
module.exports={PATTERNS:P,findings,redact,assertClean};
