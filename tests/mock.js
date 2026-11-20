// Writes a mock rules file and a mock save, to try the viewer without game files:
//   node tests/mock.js  ->  local-data/mock.biq, local-data/mock.SAV
// The save holds 42 cities of one player. Corruption, waste and gold/science/luxury are filled in with the viewer's
// own model, so the save is self-consistent; the numbers are invented, not taken from a real game.
global.Blast = require ('../src/blast.js');
const P = require ('../src/civ3parse.js');
const fs = require ('fs'), path = require ('path');

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const int = (a, b) => a + Math.floor (rnd () * (b - a + 1));

function writer (size) {
	const buf = new Uint8Array (size), dv = new DataView (buf.buffer);
	return { buf, p: 0,
		str (o, s) { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt (i); },
		w32 (o, v) { dv.setInt32 (o, v, true); }, w16 (o, v) { dv.setInt16 (o, v, true); } };
}

// Rules: one section per kind, then a closing header (the reader needs a header after each section)
const RULES = { maxTown: 8, maxCity: 12 };
const BUILDINGS = [
	// name, cost (tens of shields), upkeep, requires, flag bytes {offset from +236: bits}
	['Palace', 10, 0, -1, { 0: 1 }],
	['Barracks', 4, 1, -1, {}],
	['Granary', 6, 1, -1, {}],
	['Temple', 4, 1, -1, {}],
	['Marketplace', 8, 1, -1, { 0: 1 << 4 }],
	['Library', 9, 1, -1, { 0: 1 << 2 }],
	['Courthouse', 6, 1, -1, { 1: 1 }],
	['Aqueduct', 8, 1, -1, { 1: 1 << 3 }],
	['Hospital', 12, 2, 7, { 1: 1 << 4 }],
	['Bank', 12, 2, 4, { 0: 1 << 4 }],
	['University', 16, 3, 5, { 0: 1 << 2 }],
	['Police Station', 6, 2, -1, { 1: 1 }],
	['Forbidden Palace', 20, 0, -1, { 4: 1 << 3, 8: 1 << 5 }]
];
const ID = Object.fromEntries (BUILDINGS.map ((b, k) => [b[0], k]));

function makeRules () {
	const W = writer (200000);
	W.str (0, 'BICX'); W.p = 16;
	const section = (name, entries) => {
		W.str (W.p, name); W.w32 (W.p + 4, entries.length); W.p += 8;
		for (const [len, fill] of entries) { W.w32 (W.p, len); fill (W.p); W.p += 4 + len; }
	};
	section ('BLDG', BUILDINGS.map (([name, cost, upkeep, req, flags]) => [260, (e) => {
		W.str (e + 68, name); W.w32 (e + 144, req); W.w32 (e + 148, cost); W.w32 (e + 172, upkeep);
		for (const [o, v] of Object.entries (flags)) W.buf[e + 236 + +o] = v;
	}]));
	section ('PRTO', [['Warrior', 10], ['Musketman', 30], ['Cannon', 40]].map (([n, c]) => [100, (e) => { W.str (e + 8, n); W.w32 (e + 84, c); }]));
	section ('RULE', [[300, (e) => { W.w32 (e + 288, RULES.maxTown); W.w32 (e + 292, RULES.maxCity); }]]);
	section ('GOVT', [['Despotism', 3], ['Monarchy', 2], ['Republic', 1], ['Democracy', 0], ['Communism', 5]]
		.map (([n, lvl]) => [400, (e) => { W.str (e + 28, n); W.w32 (e + 380, lvl); }]));
	section ('DIFF', [['Chieftain', 100], ['Regent', 90], ['Monarch', 85], ['Deity', 60]].map (([n, pc]) => [120, (e) => { W.str (e + 4, n); W.w32 (e + 108, pc); }]));
	section ('WSIZ', [12, 16, 20].map ((ocn) => [40, (e) => { W.w32 (e + 4, ocn); }]));
	section ('RACE', [['Mockians', 0], ['Neighbours', 2]].map (([noun, traits]) => [2400, (e) => {
		W.w32 (e + 4, 0); W.w32 (e + 8, 0); W.str (e + 180, noun); W.buf[e + 272 + 2080] = traits;
	}]));
	W.str (W.p, 'ESPN'); W.p += 8;
	return W.buf.slice (0, W.p);
}

// Save: header, a small embedded scenario, GAME, LEAD, WRLD, then the cities
function makeSave (rules, cities, fill) {
	const W = writer (2000000);
	W.str (0, 'CIV3');
	W.str (562, 'VER#'); W.w32 (38, 8); W.p = 570;
	const g = W.p; W.str (g, 'GAME'); W.w32 (g + 24, 2 /* Monarch */); W.w32 (g + 36, cities.length); W.w32 (g + 64, 194); W.w32 (g + 80, 1 << 1); W.p += 200;
	W.str (W.p, 'LEAD'); W.w32 (W.p + 4, 420); W.w32 (W.p + 8, 1); W.w32 (W.p + 12, 0); W.w32 (W.p + 24, cities[0].id); W.w32 (W.p + 140, 2 /* Republic */);
	W.w32 (W.p + 400, 0); W.w32 (W.p + 404, 6); W.w32 (W.p + 408, 4); W.p += 440;
	W.str (W.p, 'WRLD'); W.w32 (W.p + 4, 2); W.w32 (W.p + 22, 100); W.w32 (W.p + 42, 100); W.w32 (W.p + 174, 4242); W.buf[W.p + 178] = 1; W.w32 (W.p + 238, 1); W.p += 300;
	for (const c of cities) {
		const o = W.p, v = fill (c);
		W.str (o, 'CITY'); W.w32 (o + 4, 136); W.w32 (o + 8, c.id); W.w16 (o + 12, c.x); W.w16 (o + 14, c.y); W.buf[o + 16] = 1;
		W.w32 (o + 20, c.buildings.reduce ((n, k) => n + BUILDINGS[k][2], 0)); W.buf[o + 24] = c.celebrating ? 2 : 0;
		W.w32 (o + 40, c.storedFood); W.w32 (o + 44, int (0, 60)); W.w32 (o + 52, 1); W.w32 (o + 56, 2); W.w32 (o + 220, int (1, 12));
		W.w32 (o + 360, c.foodTiles); W.w32 (o + 364, c.shields); W.w32 (o + 368, c.commerce); W.str (o + 392, c.name);
		W.w32 (o + 492, 2 * c.size); W.w32 (o + 496, v.waste); W.w32 (o + 500, v.corruption); W.w32 (o + 504, c.foodTiles - 2 * c.size);
		W.w32 (o + 508, c.shields - v.waste); W.w32 (o + 512, v.gold + v.science + v.luxury);
		W.w32 (o + 516, v.luxury); W.w32 (o + 520, v.science); W.w32 (o + 524, v.gold); W.w32 (o + 552, c.size);
		W.p = o + 556;
		c.moods.forEach ((m, k) => { const t = W.p + k * 308; W.str (t, 'CTZN'); W.w32 (t + 272, m); W.w32 (t + 292, m === 4 ? 3 : 0); W.w32 (t + 296, k < c.foreign ? 1 : 0); });
		W.p += c.size * 308;
		W.str (W.p, 'BINF'); W.w32 (W.p + 8, BUILDINGS.length); W.p += 12 + BUILDINGS.length * 12;
		W.str (W.p, 'BITM'); for (const k of c.buildings) W.buf[W.p + 8 + (k >> 3)] |= 1 << (k & 7); W.p += 8 + 32;
	}
	return W.buf.slice (0, W.p);
}

const NAMES = ['Capitol', 'Riverbend', 'Ashford', 'Northwatch', 'Saltmarsh', 'Kingsbridge', 'Oakhollow', 'Redcliff', 'Stonegate',
	'Willowmere', 'Highcrest', 'Duskvale', 'Ironport', 'Goldfield', 'Mistral', 'Thornbury', 'Larkspur', 'Eastmarch', 'Westwood',
	'Copperton', 'Brightwater', 'Frostholm', 'Greenhill', 'Sandmoor', 'Blackrock', 'Silverlake', 'Ravenhurst', 'Elmstead', 'Cedarfall',
	'Harrowgate', 'Sunhaven', 'Moonridge', 'Foxglen', 'Bramblecourt', 'Wolfden', 'Seawatch', 'Pinecrest', 'Amberley', 'Glenmoor',
	'Stormhold', 'Farreach', 'Lastlight'];
const cities = NAMES.map ((name, k) => {
	const far = k / NAMES.length, angle = rnd () * 2 * Math.PI, r = k === 0 ? 0 : 3 + far * 40;
	const size = k === 0 ? 16 : [3, 5, 7, 8, 8, 8, 10, 12, 12, 14][int (0, 9)];
	const b = new Set ([ID.Temple]);
	if (k === 0) b.add (ID.Palace);
	if (k === 20) b.add (ID['Forbidden Palace']);
	if (size > 8 || (size === 8 && rnd () < 0.4)) b.add (ID.Aqueduct);
	if (size > 12 || (size === 12 && rnd () < 0.3)) b.add (ID.Hospital);
	if (rnd () < 0.6) b.add (ID.Library);
	if (rnd () < 0.5) b.add (ID.Marketplace);
	if (b.has (ID.Library) && size >= 10 && rnd () < 0.5) b.add (ID.University);
	if (b.has (ID.Marketplace) && size >= 10 && rnd () < 0.4) b.add (ID.Bank);
	if (k > 0 && rnd () < 0.35) b.add (ID.Courthouse);
	if (k > 10 && rnd () < 0.15) b.add (ID['Police Station']);
	const specialists = size >= 10 ? int (0, 2) : 0, unhappy = int (0, Math.floor (size / 3)), happy = int (0, Math.floor (size / 3));
	const moods = Array.from ({ length: size }, (_, i) => i < happy ? 0 : (i < happy + unhappy ? 2 : (i >= size - specialists ? 4 : 1)));
	const surplus = int (-2, 8), foodTiles = 2 * size + surplus;
	return { id: 100 + k, name, size, moods, foreign: k > 30 ? int (0, 3) : 0, celebrating: false,
		x: (50 + Math.round (r * Math.cos (angle)) + 100) % 100, y: Math.max (2, Math.min (97, 50 + Math.round (r * Math.sin (angle) / 2))),
		buildings: [...b], foodTiles, storedFood: int (0, 2 * 10 * (size > 12 ? 3 : (size > 8 ? 2 : 1))),
		shields: int (2, 4 + 2 * size), commerce: int (2, 6 + 3 * size) };
});

const outDir = path.join (__dirname, '..', 'local-data');
fs.mkdirSync (outDir, { recursive: true });
const biq = makeRules ();
const rules = P.parseRulesFile (biq).rules;
// First pass without losses, to get the corruption model and commerce replay from the parser itself
const zero = () => ({ waste: 0, corruption: 0, gold: 0, science: 0, luxury: 0 });
const first = P.parse (makeSave (rules, cities, zero), rules);
const byId = Object.fromEntries (first.cities.map ((c) => [c.id, c]));
const sav = makeSave (rules, cities, (c) => {
	const pc = byId[c.id], ni = pc.reducers.length;
	const corruption = Math.round (c.commerce * first.model.shareFor (pc, ni, false));
	const waste = Math.floor (c.shields * first.model.shareFor (pc, ni, true) + 1e-9);
	return { corruption, waste, ...first.econ.replay (c.commerce - corruption, pc.buildings) };
});
fs.writeFileSync (path.join (outDir, 'mock.biq'), biq);
fs.writeFileSync (path.join (outDir, 'mock.SAV'), sav);
const check = P.parse (sav, rules);
console.log (check.diag.join ('\n'));
console.log (`wrote ${path.join (outDir, 'mock.biq')} and mock.SAV`);
