/* O TESTE QUE FALTAVA: os dois lados recebem ao.pronto?
   O net-test montava a partida na mão e nunca exercitou esse aperto de
   mao, que é exatamente onde o bug morava. */
const fs=require('fs'), path=require('path');
const noop=()=>{};
const el=()=>({style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
  addEventListener:noop,textContent:'',innerHTML:'',getContext:()=>new Proxy({},{get:()=>noop}),
  querySelector:()=>el(),querySelectorAll:()=>[]});
const doc={getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:el,body:el(),documentElement:el()};
const ORDEM=['i18n','audio','rng','data-caps','data-fields','data-nails','fx','combos','specials','progress','net'];
const CFG="\nconst APPS_SCRIPT_URL='';const APPS_SCRIPT_PRONTO=false;const FIREBASE_CONFIG={};const FIREBASE_PRONTO=false;\n";
const src=CFG+ORDEM.map(f=>fs.readFileSync(path.join(__dirname,'js')+'/'+f+'.js','utf8')).join('\n');
function cliente(){
  return new Function('document','localStorage','setTimeout','clearTimeout','performance','window','Audio',
    src+'\nreturn {Rede,TransporteLoop};')(
    doc,{getItem:()=>null,setItem:noop},setTimeout,clearTimeout,{now:Date.now},
    {addEventListener:noop,AudioContext:function(){return new Proxy({},{get:()=>()=>new Proxy({},{get:()=>noop})});}},
    function(){return{addEventListener:noop,cloneNode(){return this},play:()=>Promise.resolve()}});
}
const A=cliente(), B=cliente();
const mundo={salas:{},ouvintes:{},ouvintesJ:{},fila:[]};
const t=c=>{const x=Object.create(c.TransporteLoop); x.mundo=mundo; return x;};
A.Rede.usar(t(A)); B.Rede.usar(t(B));
(async()=>{
  let prontoA=false, prontoB=false;
  A.Rede.ao.pronto=()=>{prontoA=true;}; B.Rede.ao.pronto=()=>{prontoB=true;};
  await A.Rede.conectar(); await B.Rede.conectar();
  const cod=await A.Rede.criar({campo:'rua'},false);
  await B.Rede.entrar(cod,{});
  await new Promise(r=>setImmediate(r));
  console.log(`sala ${cod}`);
  console.log(`  anfitriao recebeu ao.pronto: ${prontoA}   estado=${A.Rede.estado}`);
  console.log(`  visitante recebeu ao.pronto: ${prontoB}   estado=${B.Rede.estado}`);

  /* e pelo matchmaking publico */
  await A.Rede.encerrar(); await B.Rede.encerrar();
  mundo.salas={};mundo.ouvintes={};mundo.ouvintesJ={};mundo.fila=[];
  prontoA=prontoB=false;
  await A.Rede.procurar({campo:'rua'});
  await B.Rede.procurar({campo:'rua'});
  await new Promise(r=>setImmediate(r));
  console.log('matchmaking:');
  console.log(`  quem esperava recebeu ao.pronto: ${prontoA}   estado=${A.Rede.estado}`);
  console.log(`  quem entrou  recebeu ao.pronto: ${prontoB}   estado=${B.Rede.estado}`);
  const ok = prontoA && prontoB;
  console.log(ok?'\nOS DOIS LADOS COMECAM A PARTIDA':'\nUM DOS LADOS FICA PRESO');
  process.exit(ok?0:1);
})();
