const base = import.meta.env.BASE_URL

export const galleryItems = [
  {
    title: 'Burned Walnut Wall Piece',
    category: 'Wood burning',
    description: 'Intricate burned pattern work on reclaimed wood, made as a statement piece for a warm interior.',
    image: `${base}images/wood-burned-sign.jpg`,
  },
  {
    title: 'Reclaimed Console Table',
    category: 'Furniture',
    description: 'A narrow custom table made from rescued timber, designed around the dimensions of a specific home.',
    image: `${base}images/reclaimed-table.jpg`,
  },
  {
    title: 'The Ember Board',
    category: 'Home object',
    description: 'Functional, tactile and one-of-a-kind. Built from offcuts that were too beautiful to throw away.',
    image: `${base}images/ember-board.jpg`,
  },
  {
    title: 'Custom Work in Progress',
    category: 'Selected commissions',
    description: 'Every piece begins with a conversation, a material, and an idea worth shaping by hand.',
    image: `${base}images/custom-work.jpg`,
  },
]

export const availablePieces = [
  {
    title: 'The Ember Board',
    status: 'Available soon',
    price: 'Price on request',
    description: 'A hand-finished board with burned edge details and visible grain movement.',
  },
  {
    title: 'Small Reclaimed Side Table',
    status: 'By commission',
    price: 'Custom order',
    description: 'Compact table concept built for small apartments, reading corners and warm interiors.',
  },
  {
    title: 'Personal Wood-Burned Sign',
    status: 'Made to order',
    price: 'From 1,200 NOK',
    description: 'A custom sign, nameplate or symbolic piece burned directly into selected wood.',
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
