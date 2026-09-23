/* ===================================================================
   Online do PREGOBOL — Firebase Realtime Database.
   Preencha o FIREBASE_CONFIG abaixo e o modo ONLINE passa a funcionar.

   1. console.firebase.google.com → Adicionar projeto (plano Spark, grátis).
      Pode desligar o Google Analytics, não faz falta.
   2. Criação → Realtime Database → Criar banco de dados
        Local: Estados Unidos (us-central1) é o mais simples.
        Comece no MODO BLOQUEADO; as regras de verdade estão abaixo.
   3. Criação → Authentication → Vamos começar → Método de login
        → ative "Anônimo".
   4. Configurações do projeto (engrenagem) → Seus apps → ícone </> (Web)
        → registre o app → copie os valores do firebaseConfig pra cá.
        O databaseURL TEM que estar aqui; se não aparecer no trecho
        copiado, pegue no topo da aba Realtime Database
        (https://SEU-PROJETO-default-rtdb.firebaseio.com).
   5. Realtime Database → aba Regras → cole isto e Publique:

   {
     "rules": {
       "salas": {
         "$sala": {
           ".read":  "auth != null",
           ".write": "auth != null",
           ".validate": "newData.hasChildren(['host'])"
         }
       },
       "fila": {
         ".read":  "auth != null",
         ".write": "auth != null",
         ".indexOn": ".value"
       }
     }
   }

   Traduzindo: precisa estar logado (anônimo conta) e só. O .validate
   impede que uma sala apagada "ressuscite" quando um celular reconecta
   atrasado. O .indexOn deixa o PROCURAR PARTIDA rápido.

   A apiKey do Firebase NÃO é segredo: ela identifica o projeto e vai
   pro navegador de qualquer jeito. Quem protege o banco são as regras.
   =================================================================== */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD6iv-IXhZJSAm5TuP9LICgt2NQwas4a3c',
  authDomain: 'pregobol-c8096.firebaseapp.com',
  databaseURL: 'https://pregobol-c8096-default-rtdb.firebaseio.com',
  projectId: 'pregobol-c8096',
  storageBucket: 'pregobol-c8096.firebasestorage.app',
  messagingSenderId: '159100446767',
  appId: '1:159100446767:web:3d1dbc662ee04127223eda'
};

/* Nada preenchido ainda? O card ONLINE avisa em vez de falhar com um
   erro que ninguém consegue resolver. */
const FIREBASE_PRONTO = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
