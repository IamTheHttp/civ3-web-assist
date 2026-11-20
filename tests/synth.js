global.Blast = require ('../src/blast.js');
const P = require ('../src/civ3parse.js'), E = require ('./encode.js');
const buf = new Uint8Array (200000); const dv = new DataView (buf.buffer);
const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt (i); };
const w32 = (o, v) => dv.setInt32 (o, v, true), w16 = (o, v) => dv.setInt16 (o, v, true);
str (0, 'CIV3');
// Scenario data at 562
let p = 562;
const section = (name, entries) => { str (p, name); w32 (p + 4, entries.length); p += 8; for (const fill of entries) { const len = fill.len; w32 (p, len); fill.f (p); p += 4 + len; } };
section ('BLDG', [{ len: 300, f: (e) => { str (e + 68, 'Granary'); w32 (e + 148, 60); } }, { len: 300, f: (e) => { str (e + 68, 'Aqueduct'); w32 (e + 148, 100); } }]);
section ('PRTO', [{ len: 200, f: (e) => { str (e + 8, 'Warrior'); w32 (e + 84, 10); } }, { len: 230, f: (e) => { str (e + 8, 'Pikeman'); w32 (e + 84, 30); } }]);
section ('RACE', Array.from ({ length: 10 }, () => ({ len: 260, f: () => {} })));
section ('RULE', [{ len: 400, f: (e) => { w32 (e + 248, 6); w32 (e + 252, 12); } }]);
str (p, 'GAME'); w32 (p + 4, 0); p += 8;      // a scenario GAME section that must be skipped
w32 (38, p - 562);
// Real GAME section
const g = p; str (g, 'GAME'); w32 (g + 36, 3); w32 (g + 64, 120); w32 (g + 80, 1 << 2); p += 400;
// Leader records: player 3 plays civilization 5, the human player 2 plays civilization 7
const lead = (pl, race) => { str (p, 'LEAD'); w32 (p + 4, 400); w32 (p + 8, pl); w32 (p + 12, race); p += 420; };
lead (3, 5); lead (2, 7);
// A decoy CITY header (wrong length) and three cities: two of player 2, one of player 3
str (p, 'CITY'); w32 (p + 4, 16); p += 24;
const city = (owner, name, moods, nat, fields) => {
	const o = p; str (o, 'CITY'); w32 (o + 4, 136); w32 (o + 8, Math.floor (Math.random () * 99)); buf[o + 16] = owner;
	str (o + 392, name); w32 (o + 552, moods.length);
	for (const [k, v] of Object.entries (fields)) w32 (o + +k, v);
	moods.forEach ((m, k) => { const c = o + 556 + k * 308; str (c, 'CTZN'); w32 (c + 272, m); w32 (c + 296, nat[k]); });
	p = o + 556 + moods.length * 308 + 152;
};
// fields: 40 stored food, 504 net food, 364 shields, 496 waste, 44 shields stored, 52 build id, 56 build type, 516 lux, 520 sci, 524 gold, 24 flags
city (2, 'Rome',    [0, 0, 1, 1, 2, 4], [7, 7, 7, 7, 7, 7], { 368: 20, 500: 5, 512: 15, 40: 12, 504: 3, 364: 10, 496: 2, 44: 20, 52: 1, 56: 2, 516: 2, 520: 9, 524: 5, 20: 4 });
city (2, 'Antium',  [2, 2, 2, 0, 3, 3], [7, 7, 5, 5, 5, 7], { 368: 10, 500: 0, 512: 10, 40: 20, 504: 2, 364: 6, 496: 0, 44: 0, 52: 0, 56: 1, 24: 1 });
city (3, 'Babylon', [0, 1], [3, 3], { 40: 1, 504: 1 });
const plain = buf.slice (0, p);
// compress as literals only, which every decoder must handle
const ops = [...plain].map ((b) => ({ lit: b }));
const r = P.parse (require ('./encode.js').__encodeOps ? null : (() => { const enc = require ('./encode.js'); return enc.encodeOps ? enc.encodeOps (ops, 1, 6) : null; }) () || plain);
const comp = E.encodeOps (ops, 1, 6);
for (const [label, input] of [['uncompressed', plain], ['compressed', comp]]) {
	const res = P.parse (input);
	console.log (`--- ${label}:`); res.diag.forEach ((d) => console.log ('  ' + d));
	for (const c of res.cities) console.log (`  ${c.name}: commerce ${c.commerce} corrupt ${c.corruption} (${c.corruptionPct}%) shields ${c.shields} waste ${c.waste} (${c.wastePct}%) foreign ${c.foreign}`), console.log (`  ${c.name}: size ${c.size} H/C/U/R/S ${c.happy}/${c.content}/${c.unhappy}/${c.resisters}/${c.specialists} foreign ${c.foreign} disorder ${c.disorder} grow ${c.grow} (box ${c.foodBox}) build ${c.buildName} in ${c.buildTurns}`);
}
require ('fs').writeFileSync (require ('path').join (require ('os').tmpdir (), 'Synthetic Autosave 1450 AD.SAV'), comp);
