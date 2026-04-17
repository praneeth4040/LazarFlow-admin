// ── Theme Builder Constants ──

export const FONT_OPTIONS = [
  'Anton-Regular.ttf',
  'Roboto-Bold.ttf',
  'Montserrat-Bold.ttf',
  'BebasNeue-Regular.ttf',
  'PTSans-Bold.ttf',
]

export const EMPTY_MAPPING_CONFIG = {
  cells: Array(12).fill(null).map(() => ({
    w:     { x: 0, y: 0, alignment: 'center' },
    kp:    { x: 0, y: 0, alignment: 'center' },
    pp:    { x: 0, y: 0, alignment: 'center' },
    rank:  { x: 0, y: 0, alignment: 'center' },
    team:  { x: 0, y: 0, alignment: 'left' },
    total: { x: 0, y: 0, alignment: 'center' },
  })),
  scoreboard: {
    color_rgb: [255, 255, 255],
    font_path: 'Anton-Regular.ttf',
    font_size: 130,
  },
  extra_fields: {
    tournament_name: {
      x: 0, y: 0,
      alignment: 'center',
      font_size: 200,
      color_rgb: [255, 255, 255],
      font_path: 'Anton-Regular.ttf',
    },
  },
}

export const DUMMY_TEAMS = [
  { rank: '1',  team: 'ALPHA SQUAD',  w: '1', pp: '15', kp: '22', total: '38' },
  { rank: '2',  team: 'BETA TEAM',    w: '0', pp: '12', kp: '18', total: '30' },
  { rank: '3',  team: 'GAMMA FORCE',  w: '0', pp: '10', kp: '15', total: '25' },
  { rank: '4',  team: 'DELTA OPS',    w: '0', pp: '8',  kp: '12', total: '20' },
  { rank: '5',  team: 'EPSILON V',    w: '0', pp: '7',  kp: '10', total: '17' },
  { rank: '6',  team: 'ZETA PRIME',   w: '0', pp: '6',  kp: '8',  total: '14' },
  { rank: '7',  team: 'ETA RIDERS',   w: '0', pp: '5',  kp: '6',  total: '11' },
  { rank: '8',  team: 'THETA X',      w: '0', pp: '4',  kp: '5',  total: '9'  },
  { rank: '9',  team: 'IOTA GANG',    w: '0', pp: '3',  kp: '4',  total: '7'  },
  { rank: '10', team: 'KAPPA CLAN',   w: '0', pp: '2',  kp: '3',  total: '5'  },
  { rank: '11', team: 'LAMBDA L',     w: '0', pp: '1',  kp: '2',  total: '3'  },
  { rank: '12', team: 'MU RAIDERS',   w: '0', pp: '0',  kp: '1',  total: '1'  },
]
