const base = import.meta.env.BASE_URL

export const galleryItems = [
  {
    title: 'Burned Walnut Wall Piece',
    category: 'Wood burning',
    description: 'Intricate burned pattern work on reclaimed wood, made as a statement piece for a warm interior.',
    image: `${base}images/wood-burned-sign.jpg`,
    alt: 'Detailed wood-burned pattern on a reclaimed walnut wall piece',
    width: 1438,
    height: 2200,
  },
  {
    title: 'Reclaimed Console Table',
    category: 'Furniture',
    description: 'A narrow custom table made from rescued timber, designed around the dimensions of a specific home.',
    image: `${base}images/reclaimed-table.jpg`,
    alt: 'Narrow console table made from reclaimed timber',
    width: 1466,
    height: 2200,
  },
  {
    title: 'The Ember Board',
    category: 'Home object',
    description: 'Functional, tactile and one-of-a-kind. Built from offcuts that were too beautiful to throw away.',
    image: `${base}images/ember-board.jpg`,
    alt: 'Reclaimed wood serving board with a dark burned edge',
    width: 1650,
    height: 2200,
  },
  {
    title: 'Custom Work in Progress',
    category: 'Selected commissions',
    description: 'Every piece begins with a conversation, a material, and an idea worth shaping by hand.',
    image: `${base}images/custom-work.jpg`,
    alt: 'Custom reclaimed wood piece taking shape in the workshop',
    width: 1466,
    height: 2200,
  },
]

export const availablePieces = [
  {
    title: 'The Ember Board',
    status: 'Occasional release',
    price: 'Confirmed by offer',
    description: 'A hand-finished board with burned edge details and visible grain movement, shared only when one is ready.',
  },
  {
    title: 'Small Reclaimed Side Table',
    status: 'Selected requests',
    price: 'Quoted individually',
    description: 'A compact table concept that may be selected when the material, project and available production period fit.',
  },
  {
    title: 'Personal Wood-Burned Sign',
    status: 'Selected requests',
    price: 'Quoted individually',
    description: 'A sign, nameplate or symbolic piece considered through the same capacity-limited request process.',
  },
]

export const requestTypes = [
  'Custom furniture',
  'Artistic wood piece',
  'Wood burning / burned design',
  'Home object',
  'Gift / personal piece',
  'Selected carpentry request',
  'Other',
]
