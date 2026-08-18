const fs=require('fs'),path=require('path');
function atomicWrite(f,o){fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});const t=`${f}.${process.pid}.tmp`;fs.writeFileSync(t,JSON.stringify(o,null,2)+'\n',{mode:0o600});fs.renameSync(t,f);}
class ExecutionState{constructor(r){this.root=path.resolve(r);this.file=path.join(this.root,'state.json');this.resultFile=path.join(this.root,'result.json');}load(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):null;}save(v){atomicWrite(this.file,v);return v;}result(){return fs.existsSync(this.resultFile)?JSON.parse(fs.readFileSync(this.resultFile,'utf8')):null;}saveResult(v){atomicWrite(this.resultFile,v);return v;}}
module.exports={ExecutionState,atomicWrite};
