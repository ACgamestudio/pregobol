/* =======================================================================
   PREGOBOL — fields (spec §3)
   The eight original table palettes are all still here, untouched, under
   PALETAS. What is new is that a field is no longer just a colour scheme:
   it now carries its own physics and its own obstacle layout, so the same
   flick behaves differently on sand, ice and wet asphalt.

     atrito     per-step velocity decay (higher = slides farther)
     parede     board restitution — this is what makes bank shots possible
     prego      nail restitution
     forca      max flick force on this surface
     golMeia    half-height of the goal mouth
     insetY     vertical squeeze of the playable area (favela is narrow)
     escorrega  random lateral drift per step (rain)
     layout     key into LAYOUTS
     cena       CSS class for the backdrop behind the table
   ======================================================================= */
const PALETAS = {
  classica: { g1:'#2E7D46', g2:'#35894E', linha:'rgba(247,242,232,.85)',
              m1:'#A06B3C', m2:'#5E3A1E', veio:'#2E1B0C', rede:'rgba(240,244,238,.46)' },
  noturna:  { g1:'#123A2A', g2:'#184B36', linha:'rgba(214,240,226,.82)',
              m1:'#3E2C22', m2:'#171210', veio:'#0C0806', rede:'rgba(200,240,220,.42)' },
  saibro:   { g1:'#B0613C', g2:'#C06E46', linha:'rgba(255,247,238,.9)',
              m1:'#7A4E2A', m2:'#472A14', veio:'#3A2010', rede:'rgba(255,250,242,.5)' },
  quadra:   { g1:'#17557F', g2:'#1D6795', linha:'rgba(240,248,255,.9)',
              m1:'#2C3E4D', m2:'#111A22', veio:'#0A1218', rede:'rgba(235,246,255,.5)' },
  cimento:  { g1:'#565B62', g2:'#646A72', linha:'rgba(255,255,255,.82)',
              m1:'#4A4A4A', m2:'#232323', veio:'#181818', rede:'rgba(255,255,255,.45)' },
  neon:     { g1:'#3A1E63', g2:'#472A78', linha:'rgba(238,224,255,.88)',
              m1:'#2A1740', m2:'#130A1E', veio:'#0C0614', rede:'rgba(230,214,255,.45)' },
  vermelha: { g1:'#7E1F22', g2:'#8F272A', linha:'rgba(255,240,240,.9)',
              m1:'#3E1E1E', m2:'#1A0C0C', veio:'#120808', rede:'rgba(255,240,240,.45)' },
  areia:    { g1:'#B79A63', g2:'#C6A96F', linha:'rgba(90,70,40,.55)',
              m1:'#8A6A3E', m2:'#4E3A20', veio:'#3A2A14', rede:'rgba(80,62,36,.45)' },
  gelo:     { g1:'#BFD9E8', g2:'#D8ECF6', linha:'rgba(60,96,120,.55)',
              m1:'#5A7A8C', m2:'#2A3E4A', veio:'#1C2A32', rede:'rgba(40,70,90,.40)' }
};

const CAMPOS = {
  rua: {
    nome: 'RIO STREET', frase: 'WELCOME TO THE STREETS',
    sub: 'Balanced physics · standard obstacles',
    paleta: 'classica', layout: 'rua', cena: 'cena-rio',
    atrito: 0.968, parede: 0.89, prego: 0.74, forca: 25, golMeia: 68, insetY: 0, escorrega: 0
  },
  praia: {
    nome: 'BEACH', frase: 'PLAY IN THE SAND',
    sub: 'Sand kills the roll · long shots cost more power',
    paleta: 'areia', layout: 'praia', cena: 'cena-praia',
    atrito: 0.958, parede: 0.84, prego: 0.70, forca: 28, golMeia: 68, insetY: 0, escorrega: 0
  },
  estadio: {
    nome: 'STADIUM', frase: 'THE BIG STAGE',
    sub: 'Perfect surface · faster ball · fewer obstacles',
    paleta: 'noturna', layout: 'estadio', cena: 'cena-estadio',
    atrito: 0.978, parede: 0.90, prego: 0.76, forca: 25, golMeia: 62, insetY: 0, escorrega: 0
  },
  chuva: {
    nome: 'RAIN', frase: 'KEEP YOUR BALANCE',
    sub: 'Wet asphalt · stronger rebounds · nothing stops where you expect',
    paleta: 'cimento', layout: 'chuva', cena: 'cena-chuva',
    atrito: 0.982, parede: 0.95, prego: 0.78, forca: 25, golMeia: 68, insetY: 0, escorrega: 0.014
  },
  gelo: {
    nome: 'ICE', frase: 'ICE CHANGES EVERYTHING',
    sub: 'Almost no friction · the cap slides for days',
    paleta: 'gelo', layout: 'gelo', cena: 'cena-gelo',
    atrito: 0.991, parede: 0.93, prego: 0.82, forca: 23, golMeia: 68, insetY: 0, escorrega: 0
  },
  favela: {
    nome: 'FAVELA', frase: 'EVERY ANGLE MATTERS',
    sub: 'Narrow pitch · tight angles · high-risk rebounds',
    paleta: 'vermelha', layout: 'favela', cena: 'cena-favela',
    atrito: 0.968, parede: 0.91, prego: 0.76, forca: 25, golMeia: 52, insetY: 44, escorrega: 0
  },
  extremo: {
    nome: 'EXTREME', frase: 'NO RULES. JUST PHYSICS.',
    sub: 'More nails · holes · moving obstacles',
    paleta: 'neon', layout: 'extremo', cena: 'cena-extremo',
    atrito: 0.974, parede: 0.97, prego: 0.88, forca: 26, golMeia: 72, insetY: 0, escorrega: 0
  }
};

/* Arcade order = difficulty ramp (spec §7). Also the unlock order. */
const ORDEM_CAMPOS = ['rua', 'praia', 'estadio', 'chuva', 'gelo', 'favela', 'extremo'];
const CAMPOS_INICIAIS = ['rua'];

/* Beating a field in ARCADE hands over a cap as well, so progression
   rewards more than a new backdrop. */
const PREMIO_ARCADE = {
  praia: 'forte', estadio: 'precisa', chuva: 'turbo', gelo: 'pesada'
};
