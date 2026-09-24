/* Firebase falso em memória: dois clientes, um servidor. Testa o
   transporte Firebase de verdade (net.js) incluindo queda e volta. */
const fs=require('fs'),path=require('path');
const RAIZ=path.join(__dirname,'js')+'/';
const clone=x=>x===undefined?null:JSON.parse(JSON.stringify(x));
const partes=p=>p.split('/').filter(Boolean);
const server={data:{},clientes:[],
  get(p){let n=this.data;for(const k of partes(p)){if(n==null||typeof n!=='object')return null;n=n[k];}return n===undefined?null:clone(n);},
  setRaw(p,v){const ks=partes(p);if(!ks.length){this.data=v||{};return;}let n=this.data;for(let i=0;i<ks.length-1;i++){if(typeof n[ks[i]]!=='object'||n[ks[i]]==null)n[ks[i]]={};n=n[ks[i]];}
    if(v===null)delete n[ks[ks.length-1]];else n[ks[ks.length-1]]=v;this.poda(this.data);},
  poda(n){for(const k of Object.keys(n)){if(n[k]&&typeof n[k]==='object'){this.poda(n[k]);if(!Object.keys(n[k]).length)delete n[k];}}},
  resolve(v){if(v&&typeof v==='object'){if(v['.sv'])return Date.now();const o={};for(const k in v)o[k]=this.resolve(v[k]);return o;}return v;},
  write(p,v){v=this.resolve(clone(v));const ks=partes(p);
    if(ks[0]==='salas'&&ks.length>=2){const antes=clone(this.data);this.setRaw(p,v);const sala=this.get('salas/'+ks[1]);
      if(sala!==null&&!sala.host){this.data=antes;const e=new Error('PERMISSION_DENIED');e.code='PERMISSION_DENIED';throw e;}}
    else this.setRaw(p,v);
    this.clientes.forEach(c=>c.notificar());}
};
function criarFirebase(){
  const cli={conectado:true,ouv:[],onDisc:[],fila:[],uid:'anon'+Math.random().toString(36).slice(2,7),
    notificar(){this.ouv.forEach(o=>o.disparar());},
    cair(){this.conectado=false;this.onDisc.forEach(([p,v])=>server.write(p,v));this.onDisc=[];this.ouv.forEach(o=>o.disparar());},
    voltar(){this.conectado=true;const f=this.fila;this.fila=[];f.forEach(x=>x());this.ouv.forEach(o=>o.disparar());}};
  server.clientes.push(cli);
  /* igual ao Firebase: objeto com chaves numéricas "cheio o bastante" vira array */
  const arr=v=>{if(!v||typeof v!=='object')return v;const o={};for(const k in v)o[k]=arr(v[k]);const ks=Object.keys(o);
    if(ks.length&&ks.every(k=>/^\d+$/.test(k))){const max=Math.max(...ks.map(Number));if(ks.length*2>max+1){const a=[];for(let i=0;i<=max;i++)a.push(o[i]===undefined?null:o[i]);return a;}}return o;};
  const snap=(key,v)=>({key,val:()=>arr(clone(v))});
  const ref=(p,q)=>{const r={
    path:p,
    set(v){return new Promise((ok,falha)=>{const faz=()=>{try{server.write(p,v);ok();}catch(e){falha(e);}};cli.conectado?setImmediate(faz):cli.fila.push(faz);});},
    remove(){return r.set(null);},
    push(v){const k='k'+Date.now()+Math.random().toString(36).slice(2,5);return ref(p+'/'+k).set(v);},
    once(){return new Promise(ok=>{const faz=()=>{let v=server.get(p);if(q&&v){const ks=Object.keys(v).sort((a,b)=>v[a]-v[b]).slice(0,q.lim);const o={};ks.forEach(k=>o[k]=v[k]);v=o;}ok(snap(partes(p).pop(),v));};cli.conectado?setImmediate(faz):cli.fila.push(faz);});},
    orderByValue(){return {limitToFirst:n=>ref(p,{lim:n})};},
    onDisconnect(){return{remove(){cli.onDisc.push([p,null]);return Promise.resolve();},cancel(){cli.onDisc=cli.onDisc.filter(x=>x[0]!==p);return Promise.resolve();}};},
    transaction(fn){return new Promise((ok,falha)=>{const faz=()=>{fn(null);const atual=server.get(p);const nv=fn(clone(atual));
      if(nv===undefined)return ok({committed:false,snapshot:snap(null,atual)});
      try{server.write(p,nv);ok({committed:true,snapshot:snap(null,server.get(p))});}catch(e){falha(e);}};cli.conectado?setImmediate(faz):cli.fila.push(faz);});},
    on(tipo,cb){let o;
      if(p==='.info/connected'){let ult=null;o={disparar(){if(cli.conectado!==ult){ult=cli.conectado;setImmediate(()=>cb(snap('connected',cli.conectado)));}}};}
      else if(tipo==='value'){let ult;o={disparar(){if(!cli.conectado)return;const v=JSON.stringify(server.get(p));if(v!==ult){ult=v;const x=server.get(p);setImmediate(()=>cb(snap(null,x)));}}};}
      else{const vistos=new Set();o={disparar(){if(!cli.conectado)return;const v=server.get(p)||{};Object.keys(v).forEach(k=>{if(!vistos.has(k)){vistos.add(k);setImmediate(()=>cb(snap(k,v[k])));}});}};}
      o.cb=cb;cli.ouv.push(o);o.disparar();return cb;},
    off(tipo,cb){cli.ouv=cli.ouv.filter(o=>o.cb!==cb);}
  };return r;};
  const fb={apps:[],initializeApp(){fb.apps.push(1);},
    auth:()=>({currentUser:fb._u,signInAnonymously:async()=>{fb._u={uid:cli.uid};}}),
    database:()=>({ref:p=>ref(p)})};
  fb.database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};
  return {fb,cli};
}
function cliente(){
  const {fb,cli}=criarFirebase();
  const store={};const ss={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]};
  const src=fs.readFileSync(RAIZ+'net.js','utf8');
  const x=new Function('firebase','sessionStorage','t',src+'\nreturn {Rede,TransporteFirebase};')(fb,ss,k=>k);
  return Object.assign(x,{cli});
}
const espera=(ms=30)=>new Promise(r=>setTimeout(r,ms));
let falhas=0;const check=(nome,ok)=>{console.log((ok?'OK   ':'FALHA')+' '+nome);if(!ok)falhas++;};
(async()=>{
  const A=cliente(),B=cliente(),C=cliente();
  let pA=0,pB=0;A.Rede.ao.pronto=()=>pA++;B.Rede.ao.pronto=()=>pB++;
  await A.Rede.conectar({});await B.Rede.conectar({});await C.Rede.conectar({});
  const cod=await A.Rede.criar({campo:'rua',alvo:3,x:undefined},false);
  await espera();
  check('sala criada com host',server.get('salas/'+cod+'/host')===A.cli.uid);
  check('host marcado vivo',server.get('salas/'+cod+'/vivo/1')===true);

  // anfitrião vai pro WhatsApp: aba congela, conexão cai
  A.cli.cair();await espera();
  check('queda apagou vivo/1',server.get('salas/'+cod+'/vivo/1')===null);
  const ok=await B.Rede.entrar(cod,{tampa:{cor:'#f00',arr:[]}});await espera();
  check('visitante entrou com anfitrião fora',ok===true);
  check('ainda não começou (host fora)',pA===0&&pB===0);
  // volta do WhatsApp
  A.cli.voltar();await espera(60);
  check('presença reescrita na volta',server.get('salas/'+cod+'/vivo/1')===true);
  check('os dois receberam pronto',pA===1&&pB===1&&A.Rede.estado==='jogando'&&B.Rede.estado==='jogando');

  // terceiro não entra
  const okC=await C.Rede.entrar(cod,{});check('terceiro recusado como cheia',okC===false&&C.Rede.motivo==='cheia');
  const okX=await C.Rede.entrar('ZZZZ',{});check('código errado = inexistente',okX===false&&C.Rede.motivo==='inexistente');

  // jogada com array vazio e objeto aninhado chega idêntica
  let recebida=null;B.Rede.ao.jogada=m=>recebida=m;
  A.Rede.registrar(1.2,0.8,null,12345);
  const fim={pecas:[{x:1,y:2}],vazio:[],placar:[1,0]};
  await A.Rede.concluir(fim);await espera();
  check('jogada chegou igualzinha',recebida&&JSON.stringify(recebida.fim)===JSON.stringify(fim)&&recebida.semente===12345);

  // queda curta no meio da partida NÃO encerra
  let saiuA=0;A.Rede.ao.saiu=()=>saiuA++;A.Rede.QUEDA_MS=200;
  B.cli.cair();await espera(80);B.cli.voltar();await espera(250);
  check('queda curta tolerada',saiuA===0&&A.Rede.estado==='jogando');
  // áudio
  let aud=null;B.Rede.ao.audio=a=>aud=a;
  await A.Rede.T.enviarAudio(cod,{de:1,mime:'audio/webm',d:'AAAA',dur:2});await espera();
  check('áudio chegou',aud&&aud.d==='AAAA');
  // saída explícita encerra na hora
  await B.Rede.encerrar();await espera();
  check('saída explícita avisada na hora',saiuA===1&&A.Rede.estado==='caiu');
  await A.Rede.encerrar();await espera();
  check('sala apagada ao encerrar',server.get('salas/'+cod)===null);
  // reconexão atrasada não ressuscita sala
  A.cli.cair();A.cli.voltar();await espera();
  check('sala não ressuscitou',server.get('salas/'+cod)===null);

  // matchmaking
  const D=cliente(),E=cliente();let pD=0,pE=0;D.Rede.ao.pronto=()=>pD++;E.Rede.ao.pronto=()=>pE++;
  await D.Rede.conectar({});await E.Rede.conectar({});
  const r1=await D.Rede.procurar({campo:'rua'});await espera();
  const r2=await E.Rede.procurar({campo:'rua'});await espera(60);
  check('procurar: mesma sala',r1.modo==='aguardando'&&r2.modo==='entrou'&&r1.sala===r2.sala);
  check('procurar: os dois começaram',pD===1&&pE===1);
  check('fila vazia depois',server.get('fila')===null);

  // recarregar a página (anfitrião) e retomar
  const F=cliente(),G=cliente();let pF=0;
  await F.Rede.conectar({});await G.Rede.conectar({});
  const cod2=await F.Rede.criar({campo:'rua'},false);await espera();
  const lemb=F.Rede.salaLembrada();
  F.cli.cair(); // página morreu
  await G.Rede.entrar(cod2,{});await espera();
  const F2=cliente();F2.Rede.ao.pronto=()=>pF++;await F2.Rede.conectar({});
  F2.Rede.T.uid=F.cli.uid;
  const ret=await F2.Rede.retomar(lemb);await espera(60);
  check('anfitrião retomou após recarregar',ret&&pF===1&&F2.Rede.estado==='jogando');

  // escrita do "vivo" perdida com a conexão de pé: autocura
  const H=cliente(),I=cliente();let pH=0,pI=0;H.Rede.ao.pronto=()=>pH++;I.Rede.ao.pronto=()=>pI++;
  H.Rede.CURA_MS=10;await H.Rede.conectar({});await I.Rede.conectar({});
  const cod3=await H.Rede.criar({campo:'rua'},false);await espera();
  server.write('salas/'+cod3+'/vivo/1',null);await espera();
  await I.Rede.entrar(cod3,{});await espera(80);
  check('autocura: vivo perdido é reescrito e a partida começa',pH===1&&pI===1);

  // mesmo navegador, duas abas (mesmo uid anônimo)
  const J=cliente(),K=cliente();K.cli.uid=J.cli.uid;let pJ=0,pK=0;J.Rede.ao.pronto=()=>pJ++;K.Rede.ao.pronto=()=>pK++;
  await J.Rede.conectar({});await K.Rede.conectar({});
  const cod4=await J.Rede.criar({campo:'rua'},false);await espera();
  const okK=await K.Rede.entrar(cod4,{});await espera(80);
  check('duas abas do mesmo navegador também começam',okK&&pJ===1&&pK===1);

  console.log(falhas?`\n${falhas} FALHA(S)`:'\nTUDO OK');process.exit(falhas?1:0);
})().catch(e=>{console.error('ERRO',e);process.exit(1);});
