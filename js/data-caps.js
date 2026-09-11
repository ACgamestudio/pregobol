/* =======================================================================
   PREGOBOL — bottle caps (spec §2)
   The piece the player flicks is a bottle cap. Every stat below is a
   MULTIPLIER over the field's base physics, never an absolute: that is what
   keeps the six types comparable and the fields meaningful.

     forca    force applied on release      (attack)
     atrito   friction multiplier (>1 = glides farther, <1 = dies sooner).
              CAREFUL: this multiplies a PER-TICK decay applied 60 times a
              second, so the whole useful range is about 0.99 → 1.01.
     quique   restitution off nails and boards
     mira     aim quality (guide length + how much wobble is cancelled)
     empurra  how hard it shoves a movable nail
     tremor   random angle added on release, in radians (the price of speed)
     raio     visual + collision radius

   Design rule from the brief: no type is objectively better. Every cap has
   one stat above 1 and at least one below.
   ======================================================================= */
const TAMPAS = {
  classica: {
    nome: 'TROPICÃO', tipo: 'BALANCED',
    forca: 1.00, atrito: 1.000, quique: 1.00, mira: 1.00, empurra: 1.00, tremor: 0.000, raio: 8.5,
    c1: '#E8C86A', c2: '#B8922F', c3: '#FFF8DC', marca: 'estrela',
    pro: 'Nothing to learn', contra: 'No standout stat'
  },
  rapida: {
    nome: 'ZAP LIMÃO', tipo: 'SPEED',
    forca: 0.94, atrito: 1.008, quique: 1.00, mira: 0.96, empurra: 0.82, tremor: 0.006, raio: 7.8,
    c1: '#C9F03A', c2: '#4F8A0F', c3: '#F4FFD6', marca: 'raio',
    pro: 'Keeps rolling — reaches anything', contra: 'Weak on contact, light on nails'
  },
  forte: {
    nome: 'MALTE 7', tipo: 'POWER',
    forca: 1.16, atrito: 0.997, quique: 0.93, mira: 0.90, empurra: 1.32, tremor: 0.010, raio: 9.0,
    c1: '#C6461F', c2: '#5E1A0A', c3: '#F6D8B0', marca: 'sete',
    pro: 'Brutal contact, shoves caps and nails', contra: 'Dies early, sloppy aim'
  },
  precisa: {
    nome: 'ÁGUA VIVA', tipo: 'PRECISION',
    forca: 0.92, atrito: 1.000, quique: 1.00, mira: 1.40, empurra: 0.88, tremor: 0.000, raio: 8.2,
    c1: '#7FD6F0', c2: '#12556E', c3: '#EAFBFF', marca: 'gota',
    pro: 'Longest aim guide, zero wobble', contra: 'Least power in the set'
  },
  turbo: {
    nome: 'FOGUETE', tipo: 'TURBO',
    forca: 1.26, atrito: 1.010, quique: 1.06, mira: 0.74, empurra: 0.96, tremor: 0.045, raio: 8.0,
    c1: '#FF7A18', c2: '#7A2A00', c3: '#FFE2A8', marca: 'chama',
    pro: 'Fastest cap on the table', contra: 'Wobbles on release — hard to trust'
  },
  pesada: {
    nome: 'BOTECO PRETO', tipo: 'HEAVY',
    forca: 1.18, atrito: 0.991, quique: 0.90, mira: 0.94, empurra: 1.75, tremor: 0.008, raio: 9.2,
    c1: '#2B2B2B', c2: '#0B0B0B', c3: '#D9C08A', marca: 'coroa',
    pro: 'Bulldozes anything in the way', contra: 'Absorbs rebounds, stops fast'
  }
};
const ORDEM_TAMPAS = ['classica', 'rapida', 'forte', 'precisa', 'turbo', 'pesada'];

/* Caps 1–2 are free; the rest are earned (spec §11). */
const TAMPAS_INICIAIS = ['classica', 'rapida'];
