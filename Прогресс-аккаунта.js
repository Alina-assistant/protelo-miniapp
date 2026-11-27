(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ProTeloProgress=api;})(globalThis,function(){
'use strict';
function create(o){
 const cloudKey='protelo_case_progress_v1',localKey=o.key+':tg:'+o.owner+':cloud',claimKey=o.key+':legacy-owner';
 let revision=null,sequence=Promise.resolve(),generation=0,pending=0,status='local',lastJSON=null;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const notify=code=>{try{o.onError?.(code);}catch{}};
 const get=k=>{try{return o.local.getItem(k);}catch{return null;}};
 const put=(k,value)=>{try{o.local.setItem(k,JSON.stringify(value));}catch{notify('LOCAL_UNAVAILABLE');}};
 const readLocal=()=>{try{return JSON.parse(get(localKey)||'null');}catch{return null;}};
 const meaningful=s=>!!(s&&(s.started||s.current||s.visited?.length||s.grants?.length));
 function call(method,...args){return new Promise((resolve,reject)=>{
  let finished=false;const timer=setTimeout(()=>{if(!finished){finished=true;reject(new Error('CLOUD_TIMEOUT'));}},o.timeout??4000);
  try{o.cloud[method](...args,(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(new Error('CLOUD_UNAVAILABLE')):resolve(value);});}
  catch{finished=true;clearTimeout(timer);reject(new Error('CLOUD_UNAVAILABLE'));}
 });}
 function parse(raw){
  if(!raw)return null;let r;try{r=JSON.parse(raw);}catch{throw new Error('CLOUD_INVALID');}
  if(r?.v!==1||typeof r.r!=='string'||r.r.length>100||!r.s||typeof r.s!=='object'||Array.isArray(r.s))throw new Error('CLOUD_INVALID');return r;
 }
 async function open({legacy=null}={}){
  const cached=readLocal();let remote;
  try{remote=parse(await call('getItem',cloudKey));status='cloud';}
  catch(error){status='local';revision=cached?.b??cached?.r??null;notify(error.message);
   if(cached?.s)return clone(cached.s);
   if(meaningful(legacy)&&(!get(claimKey)||get(claimKey)===JSON.stringify(o.owner))&&(await o.confirmImport?.())){
    put(claimKey,o.owner);put(localKey,{v:1,r:null,b:null,d:true,s:legacy});return clone(legacy);
   }return o.empty();
  }
  revision=remote?.r??null;
  if(remote){
   if(cached?.d&&JSON.stringify(cached.s)!==JSON.stringify(remote.s)){
    put(localKey+':backup',cached);
    if(cached.b===revision||(await o.confirmConflict?.())){
     try{await save(cached.s);}catch{}return clone(cached.s);
    }
   }
   put(localKey,{...remote,b:remote.r,d:false});lastJSON=JSON.stringify(remote.s);return clone(remote.s);
  }
  let chosen=cached?.s;
  if(!chosen&&meaningful(legacy)&&(!get(claimKey)||get(claimKey)===JSON.stringify(o.owner))&&(await o.confirmImport?.())){
   put(claimKey,o.owner);chosen=legacy;
  }
  if(chosen&&meaningful(chosen)){try{await save(chosen);}catch{}return clone(chosen);}
  return o.empty();
 }
 function save(state,force=false){
  const snapshot=clone(state),json=JSON.stringify(snapshot);
  if(!force&&pending===0&&status==='cloud'&&json===lastJSON)return Promise.resolve(true);
  const ticket=++generation;pending++;
  put(localKey,{v:1,r:revision,b:revision,d:true,s:snapshot});
  sequence=sequence.catch(()=>{}).then(async()=>{
   let current;try{current=parse(await call('getItem',cloudKey));}catch(error){if(!force)throw error;current=null;}
   if(!force&&(current?.r??null)!==revision){status='conflict';throw new Error('CLOUD_CONFLICT');}
   const r={v:1,r:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),t:Date.now(),s:snapshot};
   const raw=JSON.stringify(r);if(new TextEncoder().encode(raw).length>4096)throw new Error('CLOUD_SIZE');
   if(await call('setItem',cloudKey,raw)!==true)throw new Error('CLOUD_WRITE_FAILED');
   revision=r.r;status='cloud';lastJSON=json;
   if(ticket===generation)put(localKey,{...r,b:r.r,d:false});
   else{const latest=readLocal();if(latest?.d)put(localKey,{...latest,b:r.r});}
   return true;
  }).catch(error=>{if(status!=='conflict')status='local';notify(error.message);throw error;}).finally(()=>{pending--;});
  return sequence;
 }
 async function refresh(){
  if(pending)return null;
  const ticket=generation;
  try{
   const remote=parse(await call('getItem',cloudKey));
   if(ticket!==generation||!remote)return null;
   const cached=readLocal();
   if(remote.r===revision){
    if(cached?.d){const saving=save(cached.s),savedGeneration=generation;await saving;return generation===savedGeneration?clone(cached.s):null;}
    const recovered=status!=='cloud';status='cloud';return recovered?clone(remote.s):null;
   }
   if(cached?.d){status='conflict';notify('CLOUD_CONFLICT');return null;}
   revision=remote.r;lastJSON=JSON.stringify(remote.s);status='cloud';put(localKey,{...remote,b:remote.r,d:false});return clone(remote.s);
  }catch(error){notify(error.message);return null;}
 }
 const reset=()=>save(o.empty(),true);
 return {open,save,refresh,reset,flush:()=>sequence,get status(){return status;}};
}
return {create};
});
