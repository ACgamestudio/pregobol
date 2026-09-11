/* ===================================================================
   Fill this in with your own Firebase project, then online play works.

   1. console.firebase.google.com → create a project (free Spark plan)
   2. Build → Realtime Database → Create database
        Start in TEST MODE for now; the rules below are the real ones.
   3. Build → Authentication → Sign-in method → enable "Anonymous"
   4. Project settings → Your apps → Web app → copy the config here

   Realtime Database rules. Test mode leaves the database world-writable,
   which is fine for an evening of testing and not fine afterwards:

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
         ".write": "auth != null"
       }
     }
   }

   These say: you must be signed in (anonymous counts), and that is all.
   Anyone signed in can read any room. For a friendly cap-flicking game
   that is a reasonable trade; if it ever matters, move the turn writes
   behind a Cloud Function.
   =================================================================== */
const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: ''
};

/* Nothing filled in yet? The ONLINE card says so instead of failing
   with a stack trace nobody can act on. */
const FIREBASE_PRONTO = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
