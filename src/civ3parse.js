// Reads a Civilization III Conquests / Complete SAV file and extracts per-city data for the player.
// Layouts follow OpenCiv3's QueryCiv3 (MIT) and c3sat (MIT); the growth rule was read from the GOG Civ3Conquests.exe.
// Every structural assumption is checked; failures are reported in result.diag instead of producing wrong numbers.
const Civ3Parse = (() => {
	const td = new TextDecoder ('latin1');

	function readAscii (b, off, len) {
		let end = off;
		while (end < off + len && end < b.length && b[end] !== 0) end++;
		return td.decode (b.subarray (off, end));
	}
	const isHeaderChar = (c) => (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 32;
	const isHeaderAt = (b, off) => off + 4 <= b.length && isHeaderChar (b[off]) && isHeaderChar (b[off + 1]) && isHeaderChar (b[off + 2]) && isHeaderChar (b[off + 3]);
	const tag = (s) => [...s].map ((c) => c.charCodeAt (0));
	function findAll (b, s, from = 0, to = b.length) {
		const t = tag (s), out = [];
		for (let i = from; i + 4 <= to; i++)
			if (b[i] === t[0] && b[i + 1] === t[1] && b[i + 2] === t[2] && b[i + 3] === t[3]) out.push (i);
		return out;
	}

	// A scenario (BIQ) section: 4-char name, entry count, then entries that each start with their own byte length.
	// Accepted only if the entries end exactly where another section header begins.
	function readBiqSection (b, name, from, to, diag) {
		for (const off of findAll (b, name, from, to)) {
			const count = new DataView (b.buffer, b.byteOffset + off + 4, 4).getInt32 (0, true);
			if (count <= 0 || count > 4096) continue;
			let p = off + 8, entries = [], ok = true;
			for (let k = 0; k < count; k++) {
				if (p + 4 > b.length) { ok = false; break; }
				const len = new DataView (b.buffer, b.byteOffset + p, 4).getInt32 (0, true);
				if (len <= 0 || len > 100000 || p + 4 + len > b.length) { ok = false; break; }
				entries.push (p);
				p += 4 + len;
			}
			if (ok && isHeaderAt (b, p)) {
				diag.push (`${name}: ${count} entries at byte ${off}`);
				return entries;
			}
		}
		diag.push (`${name}: not found (names for that kind of thing will show as numbers)`);
		return null;
	}


	// Rules (BIQ data): from conquests.biq, or embedded in a save that uses custom rules. Offsets were verified against
	// the default Conquests rules (83 buildings, 8 governments, 32 civilizations).
	function readRules (b, from, to, diag) {
		const dv = new DataView (b.buffer, b.byteOffset, b.byteLength);
		const i32 = (o) => dv.getInt32 (o, true);
		const sec = (name) => readBiqSection (b, name, from, to, diag);
		const bldg = sec ('BLDG'), tech = sec ('TECH'), terr = sec ('TERR'), good = sec ('GOOD'), prto = sec ('PRTO'), rule = sec ('RULE'), govt = sec ('GOVT'), diff = sec ('DIFF'),
		      wsiz = sec ('WSIZ'), race = sec ('RACE');
		if (! bldg || ! govt || ! diff || ! wsiz) return null;
		const game = sec ('GAME');
		const r = {
			buildings: bldg.map ((e) => ({
				name: readAscii (b, e + 68, 32), cost: i32 (e + 148), upkeep: i32 (e + 172), requires: i32 (e + 144),
				center: (b[e + 236] & 1) !== 0, reducesCorruption: (b[e + 237] & 1) !== 0, forbiddenPalace: ((b[e + 244] >> 5) & 1) !== 0,
				science50: ((b[e + 236] >> 2) & 1) !== 0, luxury50: ((b[e + 236] >> 3) & 1) !== 0, gold50: ((b[e + 236] >> 4) & 1) !== 0,
				doublesScience: ((b[e + 248] >> 4) & 1) !== 0, capitalization: ((b[e + 238] >> 3) & 1) !== 0,
				// Size caps (OpenCiv3 QueryCiv3 Bldg.cs): Aqueduct-type buildings allow size level 2, Hospital-type level 3
				allowsSize2: ((b[e + 237] >> 3) & 1) !== 0, allowsSize3: ((b[e + 237] >> 4) & 1) !== 0,
				// Placement (same source): must be near water / a river, or coastal
				spaceshipPart: i32 (e + 216) >= 0, requiredAdvance: i32 (e + 220),
				nearWater: ((b[e + 237] >> 6) & 1) !== 0, nearRiver: ((b[e + 237] >> 7) & 1) !== 0, coastal: (b[e + 240] & 1) !== 0,
				wonder: (b[e + 240] & 0b1100) !== 0,
				// +1 food / shield / commerce on water tiles of a large water body (Harbor, Offshore Platform, Commercial Dock)
				// Tourist attraction (+248 bit 17): commerce once the building is over 1000 years old
				touristAttraction: ((b[e + 250] >> 1) & 1) !== 0,
				// War weariness (GOG 0x4BD780): +236 bit 22 removes size/4 faces in its city (Police Station); wonder flag
				// +248 bit 11 removes 1 face in every city of its owner (Universal Suffrage)
				reducesWarWeariness: ((b[e + 238] >> 6) & 1) !== 0, warWearinessWonder: ((b[e + 249] >> 3) & 1) !== 0,
				// Production (+208, quarters: Factory 2 = +50%), power plant (+237 bit 5: counts only with its required
				// building, and only the best one), made obsolete by (+224, a tech)
				production: i32 (e + 208), powerPlant: ((b[e + 237] >> 5) & 1) !== 0, obsoleteBy: i32 (e + 224),
				foodWater: (b[e + 239] & 1) !== 0, shieldsWater: ((b[e + 238] >> 7) & 1) !== 0, commerceWater: ((b[e + 239] >> 1) & 1) !== 0 })),
			// TERR: name after a bitmap of possible resources (one bit each, rounded up to bytes)
			terrains: terr ? terr.map ((e) => readAscii (b, e + 8 + Math.ceil (i32 (e + 4) / 8), 32)) : [],
			// Yields (OpenCiv3 Terr.cs): after the name and civilopedia entry
			terrainYields: terr ? terr.map ((e) => { const t = e + 8 + Math.ceil (i32 (e + 4) / 8);
				return { irrigation: i32 (t + 64), mining: i32 (t + 68), road: i32 (t + 72), food: i32 (t + 84), shields: i32 (t + 88), commerce: i32 (t + 92) }; }) : [],
			// Resources (OpenCiv3 Good.cs): prerequisite tech and the yield they add
			// +60 class: 0 bonus, 1 luxury, 2 strategic
			goods: good ? good.map ((e) => ({ name: readAscii (b, e + 4, 24), type: i32 (e + 60), prereq: i32 (e + 76), food: i32 (e + 80), shields: i32 (e + 84), commerce: i32 (e + 88) })) : [],
			// TECH +72 era, +88..+100 prerequisites (-1: none), +104 flags (0x80000: cannot be traded)
			techs: tech ? tech.map ((e) => ({ name: readAscii (b, e + 4, 32), era: i32 (e + 72),
				prereqs: [0, 1, 2, 3].map ((j) => i32 (e + 88 + 4 * j)).filter ((x) => x >= 0), noTrade: (i32 (e + 104) & 0x80000) !== 0 })) : [],
			// +208: the unit needs support (C3X UnitType.requires_support)
			units: prto ? prto.map ((e) => ({ name: readAscii (b, e + 8, 32), cost: i32 (e + 84), requiresSupport: i32 (e + 208) !== 0 })) : [],
			// OpenCiv3 Govt.cs: +12 buildings need maintenance, +20 tile penalty (-1 on a yield above 2), +24 trade bonus
			// (+1 commerce on a tile with commerce)
			governments: govt.map ((e) => ({ name: readAscii (b, e + 28, 64), corruption: i32 (e + 380), maintenance: i32 (e + 12) !== 0,
				tilePenalty: i32 (e + 20) !== 0, tradeBonus: i32 (e + 24) !== 0,
				// Unit support: free units (-1: no unit costs), free units per town / city / metropolis, gold per further unit
				freeUnits: i32 (e + 540), freePerSize: [i32 (e + 544), i32 (e + 548), i32 (e + 552)], unitCost: i32 (e + 556),
				// War weariness level (+560): 0 none, 1 low, 2 high
				warWeariness: i32 (e + 560) })),
			difficulties: diff.map ((e) => ({ name: readAscii (b, e + 4, 64), contentCitizens: i32 (e + 68), costFactor: i32 (e + 104), optimalPercent: i32 (e + 108), corruptionPercent: i32 (e + 116) })),
			worldSizes: wsiz.map ((e) => ({ optimalCities: i32 (e + 4) })),
			civs: [], maxTown: 6, maxCity: 12,
			calendar: game ? calendarOf (b, game[0]) : null
		};
		if (rule) {
			const t = i32 (rule[0] + 288), c = i32 (rule[0] + 292);
			if (t > 0 && c > t && c < 1000) { r.maxTown = t; r.maxCity = c; }
		}
		if (race) for (const e of race) {
			// City and great-leader name lists, and 4 eras x 520 bytes of artwork paths, come before the fixed fields
			const n = i32 (e + 4), m = i32 (e + 8 + 24 * n), shift = 24 * n + 32 * m;
			const traits = b[e + 272 + 2080 + shift];
			// OpenCiv3 Race.cs, after the 4 eras of art: culture group, aggression (-2..2), shunned and favorite government
			r.civs.push ({ noun: readAscii (b, e + 180 + shift, 40), commercial: (traits & 2) !== 0, industrious: (traits & 32) !== 0,
			               agricultural: (traits & 64) !== 0, seafaring: (traits & 128) !== 0,
			               cultureGroup: i32 (e + 2300 + shift), aggression: i32 (e + 2312 + shift),
			               shunnedGov: i32 (e + 2320 + shift), favoriteGov: i32 (e + 2324 + shift) });
		}
		return r;
	}

	// Calendar (BIQ GAME, OpenCiv3 Game.cs): base time unit (0 years), start year, then 7 periods: turns, and time units per
	// turn. After the 4th int comes one int per playable civilization.
	function calendarOf (b, e) {
		const dv = new DataView (b.buffer, b.byteOffset, b.byteLength), i32 = (o) => dv.getInt32 (o, true);
		const n = i32 (e + 12), g = (n > 0 && n < 64 ? 4 * n : 0), f = (k) => i32 (e + k + g);
		return { unit: f (40), start: f (52), turns: [0, 1, 2, 3, 4, 5, 6].map ((j) => f (64 + 4 * j)), perTurn: [0, 1, 2, 3, 4, 5, 6].map ((j) => f (92 + 4 * j)) };
	}
	function yearAt (cal, turn) {
		let y = cal.start, t = turn;
		for (let j = 0; j < 7 && t > 0; j++) { const k = Math.min (t, cal.turns[j]); y += k * cal.perTurn[j]; t -= k; }
		return y;
	}
	// Tourist attraction commerce by age in years (GOG 0x4B0710)
	const touristCommerce = (age) => age <= 1000 ? 0 : age < 1500 ? 2 : age < 1750 ? 4 : age < 1875 ? 6 : age < 2000 ? 8 : age < 2250 ? 10 : age < 2500 ? 12 : 14;

	function parseRulesFile (fileBytes) {
		const diag = [];
		let b = fileBytes;
		if (readAscii (b, 0, 3) !== 'BIC') {
			const r = Blast.decompress (b);
			if (r.err !== 0 && r.err !== 2) return { diag: ['Not a readable .biq file'], rules: null };
			b = r.data;
		}
		if (readAscii (b, 0, 3) !== 'BIC') return { diag: ['Not a Civ3 rules (.biq) file'], rules: null };
		const rules = readRules (b, 0, b.length, diag);
		if (rules) diag.push (`Rules: ${rules.buildings.length} buildings, ${rules.units.length} units, ${rules.governments.length} governments`);
		return { diag, rules };
	}

	// Corruption and waste, transcribed from the game (GOG Civ3Conquests.exe): City_compute_corrupted_yield 0x4B1190,
	// Leader_get_optimal_city_number 0x5676C0, the distance function 0x4378D0. Integer steps truncate toward zero as in
	// the exe. Matches the game exactly in every city of the save it was checked on (corruption and waste).
	// Not in the save, so assumed: the city is connected to the capital by trade (otherwise distance x 5/4), and no
	// police-type specialists (they subtract their corruption value).
	const tdiv = (a, b) => Math.trunc (a / b);

	// War weariness in one city (GOG 0x4BD780, 0x4BD6D0). level: the government's (0 none, 1 low, 2 high); points: yours
	// toward each enemy you are at war with. Each enemy counts alone: above 30 / 60 / 120 points it adds a quarter / half /
	// all of the base (size, or size / 2 rounded down for low). Police Station-type buildings remove size / 4 each, a
	// Universal Suffrage-type wonder 1, and the total stops at the size. An enemy with negative points (it declared war on
	// you) gives size / 4 content instead, again at most the size.
	function warWearinessCity (level, points, size, police = 0, suffrage = 0) {
		let unhappy = 0, bonus = 0;
		for (const v of points) {
			if (v < 0) bonus += tdiv (size, 4);
			if (! level) continue;
			const base = level === 2 ? size : tdiv (size, 2);
			unhappy += v > 120 ? 2 * base : v > 60 ? base : v > 30 ? tdiv (base, 2) : 0;
		}
		unhappy = Math.min (size, Math.max (0, unhappy - police * tdiv (size, 4) - suffrage));
		return { unhappy, bonus: Math.min (size, bonus) };
	}
	function corruptedYield (m, city, ni, Y, isWaste) {
		const none = { lost: 0, D: 0, rankNum: 0, nopt: 1, NiTotal: ni, capLost: 0 };
		if (Y <= 0) return none;
		if (m.govLevel === 4 || (isWaste && city.disorder)) return { ...none, lost: Y, capLost: Y }; // Anarchy; disorder wastes all shields
		let Ni = ni + (city.isCapital ? 10 : 0);                  // the capital counts as 10 Courthouses
		let nopt = m.nopt + tdiv (m.ocn * Ni, 4);                  // each Courthouse / Police Station: + OCN/4 for this city
		if (isWaste && city.celebrating) nopt += tdiv (m.ocn, 4);
		let d = city.capitalDistance;
		for (const f of m.fpCities) { if (f === city) Ni += 7; d = Math.min (d, m.dist (city, f)); } // a Forbidden Palace city: 7 more
		let D = [tdiv (3 * d, 4), d, d, tdiv (3 * d, 2), m.maxD, tdiv (m.maxD, 4)][m.govLevel];
		D = m.maxD < 2 ? 2 : Math.max (2, Math.min (D, m.maxD));
		if (isWaste && city.celebrating) D = tdiv (D + 1, 2);
		for (let k = 0; k < Ni; k++) D = tdiv (D + 1, 2);       // halved per Courthouse etc., rounding up
		const R = m.govLevel === 5 ? tdiv (m.cityCount, 2) : city.rank;
		const Rp = R >= nopt ? 2 * R - nopt : R;
		const rankNum = tdiv (Rp * Y + 1, 2);
		const v = tdiv (m.maxD * rankNum + D * Y * nopt + tdiv (m.maxD * nopt, 2), m.maxD * nopt); // rank + distance, rounded
		const scaled = tdiv (v * m.corruptionPct, 100);
		const capLost = tdiv (Math.max (0, 9 - Ni) * Y, 10);     // at most 90%, -10% per Courthouse etc., rounded down
		return { lost: Math.max (0, Math.min (scaled, capLost)), D, rankNum, nopt, NiTotal: Ni, capLost };
	}
	// The parts as shares of the city's yield, for display: distance, rank, cap; share = what is lost
	function corruptionParts (m, city, ni, isWaste, Y) {
		const x = corruptedYield (m, city, ni, Y, isWaste);
		if (Y <= 0) return { dist: 0, rank: 0, cap: 0, share: 0 };
		return { dist: x.D / m.maxD, rank: x.rankNum / (Y * x.nopt), cap: Math.max (0, 9 - x.NiTotal) / 10, share: x.lost / Y };
	}

	function parse (fileBytes, loadedRules) {
		const diag = [], result = { diag, cities: [], ok: false };
		let b = fileBytes;
		const magic = readAscii (b, 0, 4);
		if (magic === 'CIV3') diag.push (`File is not compressed (${b.length} bytes)`);
		else {
			const r = Blast.decompress (b);
			if (r.err !== 0 && r.err !== 2) { diag.push (`Decompression failed (error ${r.err}); is this a Civ3 SAV file?`); return result; }
			b = r.data;
			diag.push (`Decompressed ${fileBytes.length} -> ${b.length} bytes${r.err === 2 ? ' (stream ended without end marker)' : ''}`);
		}
		if (readAscii (b, 0, 4) !== 'CIV3') { diag.push ('Not a Civ3 save: missing "CIV3" header'); return result; }
		const dv = new DataView (b.buffer, b.byteOffset, b.byteLength);
		const i32 = (o) => dv.getInt32 (o, true), i16 = (o) => dv.getInt16 (o, true), u8 = (o) => b[o];

		// Embedded scenario data starts at byte 562; its length is stored at byte 38
		const BIQ_START = 562;
		let biqLen = i32 (38), biqEnd = BIQ_START + biqLen;
		if (biqLen <= 0 || biqEnd > b.length) { diag.push (`Scenario length at byte 38 looks wrong (${biqLen}); searching instead`); biqEnd = -1; }
		else diag.push (`Embedded scenario data: bytes ${BIQ_START}-${biqEnd}`);

		const gameOffs = findAll (b, 'GAME');
		let gameOff = biqEnd > 0 ? gameOffs.find ((o) => o >= biqEnd) : undefined;
		if (gameOff === undefined) gameOff = gameOffs.length >= 2 ? gameOffs[1] : gameOffs[0];
		if (gameOff === undefined) { diag.push ('GAME section not found'); return result; }
		if (biqEnd < 0) biqEnd = gameOff;
		const scenarioTo = biqEnd;

		let rules = readRules (b, BIQ_START, scenarioTo, []);
		if (rules) diag.push ('Rules: from the save (custom rules)');
		else if (loadedRules) { rules = loadedRules; diag.push ('Rules: from the loaded conquests.biq'); }
		else diag.push ('Rules: not loaded. Load conquests.biq to see building and unit names and the Courthouse what-if');
		result.rules = rules;
		const buildingName = (id) => (rules && rules.buildings[id]) ? rules.buildings[id].name : `Building #${id}`;
		const buildingCost = (id) => (rules && rules.buildings[id]) ? rules.buildings[id].cost * 10 : null; // stored in tens of shields
		const unitName = (id) => (rules && rules.units[id]) ? rules.units[id].name : `Unit #${id}`;
		const unitCost = (id) => (rules && rules.units[id]) ? rules.units[id].cost : null;
		const maxTown = rules ? rules.maxTown : 6, maxCity = rules ? rules.maxCity : 12;
		diag.push (`Town up to size ${maxTown}, city up to ${maxCity}`);

		// Game state
		const humanBits = i32 (gameOff + 80) >>> 0, flags5 = u8 (gameOff + 17);
		const accelerated = (flags5 & 2) !== 0, cultureFlips = (flags5 & 128) !== 0;
		let player = -1;
		for (let c = 1; c < 32; c++) if (humanBits & (1 << c)) { player = c; break; }
		result.turn = i32 (gameOff + 64);
		result.difficultyId = i32 (gameOff + 24);
		result.numberOfCities = i32 (gameOff + 36);
		result.player = player;
		result.accelerated = accelerated;
		// The current year: from the save's own scenario calendar, else the rules file's (years only)
		{
			const sg = readBiqSection (b, 'GAME', BIQ_START, scenarioTo, []);
			const cal = sg ? calendarOf (b, sg[0]) : (rules && rules.calendar);
			result.year = cal && cal.unit === 0 ? yearAt (cal, result.turn) : null;
		}
		result.cultureFlips = cultureFlips;
		diag.push (`GAME at byte ${gameOff}: turn ${result.turn}, ${result.numberOfCities} cities in the world, human player ${player}${accelerated ? ', accelerated production' : ''}`);
		if (player < 0) { diag.push ('No human player found'); return result; }

		// Known techs (layout from OpenCiv3 QueryCiv3 Sav.cs): after the 856-byte Conquests GAME block come one int per
		// continent, then one int per tech whose bit k means player k knows it. Checked below against what cities build.
		result.knownTechs = null;
		const continents = i32 (gameOff + 300), techStart = gameOff + 856 + 4 * continents;
		if (rules && rules.techs.length && continents >= 0 && continents < 1000 && techStart + 4 * rules.techs.length <= b.length) {
			result.knownTechs = new Set ();
			rules.techs.forEach ((t, k) => { if ((i32 (techStart + 4 * k) >>> player) & 1) result.knownTechs.add (k); });
		}

		// The player's civilization. Citizens' nationality is a civilization number (an index into the RACE list), not a
		// player number, so this is what "foreign" is measured against. Each LEAD record holds player number and civ.
		let playerRace = -1, capitalId = -1, government = -1;
		for (const off of findAll (b, 'LEAD', gameOff)) {
			if (i32 (off + 8) !== player) continue;
			const r = i32 (off + 12);
			if (r >= 0 && r < 256) {
				playerRace = r; capitalId = i32 (off + 24); government = i32 (off + 140);
				result.rates = { luxury: i32 (off + 400), science: i32 (off + 404), tax: i32 (off + 408) }; // tenths
				break;
			}
		}
		result.government = government;

		// World map: size and wrapping, for distances
		let world = null;
		for (const off of findAll (b, 'WRLD', gameOff)) {
			if (i32 (off + 4) !== 2) continue; // the first of the three WRLD blocks has length 2
			const w = i32 (off + 42), h = i32 (off + 22);
			if (w > 0 && h > 0 && w < 1000 && h < 1000) { world = { width: w, height: h, wrapX: (b[off + 178] & 1) !== 0, wrapY: (b[off + 178] & 2) !== 0, sizeId: i32 (off + 238), seed: i32 (off + 174) }; break; }
		}
		result.world = world;
		diag.push (world ? `Map ${world.width} x ${world.height}${world.wrapX ? ', wraps east-west' : ''}${world.wrapY ? ', wraps north-south' : ''}, world size #${world.sizeId}` : 'World map size not found');
		diag.push (playerRace >= 0 ? `Your civilization is number ${playerRace}` : 'Your civilization was not found in the LEAD records; guessing it from your citizens');

		// Shield multiplier in quarters (GOG City_recompute_production 0x4B05D0): 4 + the Production of every building in the
		// city + the best power plant whose required building (Factory) is there; a building made obsolete by a known tech
		// counts nothing. Shields = (raw - waste) x multiplier / 4, rounded down.
		result.shieldMult = (set) => {
			let base = 4, best = 0;
			if (! rules || ! set) return base;
			for (const k of set) {
				const bd = rules.buildings[k];
				if (! bd || ! bd.production) continue;
				if (bd.obsoleteBy >= 0 && result.knownTechs && result.knownTechs.has (bd.obsoleteBy)) continue;
				if (bd.powerPlant) { if (bd.requires < 0 || set.has (bd.requires)) best = Math.max (best, bd.production); }
				else base += bd.production;
			}
			return base + best;
		};

		// Cities: a "CITY" header with length 136 starts a real city record (other CITY headers are something else)
		const CITY_FIXED = 556, CTZN_SIZE = 308;
		let found = 0, rejected = 0;
		const civTotals = {}; // owner -> totals of all its cities
		for (const off of findAll (b, 'CITY', gameOff)) {
			if (i32 (off + 4) !== 136) continue;
			if (off + CITY_FIXED > b.length) { rejected++; continue; }
			const count = i32 (off + 552), specialistsPopd = i32 (off + 548);
			if (count < 0 || count > 255 || off + CITY_FIXED + count * CTZN_SIZE > b.length) { rejected++; continue; }
			let citizensOk = true;
			const moods = [0, 0, 0, 0, 0], nationalities = {}, specialistTypes = {};
			for (let k = 0; k < count; k++) {
				const c = off + CITY_FIXED + k * CTZN_SIZE;
				if (readAscii (b, c, 4) !== 'CTZN') { citizensOk = false; break; }
				const type = i32 (c + 272);
				if (type >= 0 && type <= 4) moods[type]++;
				if (type === 4) { const st = i32 (c + 292); specialistTypes[st] = (specialistTypes[st] || 0) + 1; }
				const nat = i32 (c + 296);
				nationalities[nat] = (nationalities[nat] || 0) + 1;
			}
			if (! citizensOk) { rejected++; continue; }
			// Current buildings: the BITM bitmap after the building history (BINF), one bit per building type
			const binf = off + CITY_FIXED + count * CTZN_SIZE;
			let buildings = null;
			if (readAscii (b, binf, 4) === 'BINF') {
				const bcount = i32 (binf + 8), bitm = binf + 12 + bcount * 12;
				if (bcount >= 0 && bcount < 1024 && readAscii (b, bitm, 4) === 'BITM') {
					buildings = new Set ();
					for (let k = 0; k < Math.min (256, bcount); k++) if ((b[bitm + 8 + (k >> 3)] >> (k & 7)) & 1) buildings.add (k);
				}
			}
			found++;
			const owner = u8 (off + 16);
			// Tourist attractions: commerce from wonders over 1000 years old (GOG 0x4B0710), by the year in the city's building
			// history (BINF entry: year, builder, culture). The game adds it to the tiles' commerce before corruption.
			let tourist = 0;
			if (buildings && rules && result.year !== null) {
				const now = result.year === 0 ? 1 : result.year;
				for (const k of buildings) if (rules.buildings[k] && rules.buildings[k].touristAttraction) tourist += touristCommerce (now - i32 (binf + 12 + 12 * k));
			}
			// Totals per civilization (every owner), for the History comparison. Same fields as the player's cities;
			// specialists' output added as in the player's totals. A city counts as checked when its commerce split,
			// shields and food add up.
			{
				const t = civTotals[owner] || (civTotals[owner] = { cities: 0, citizens: 0, commerce: 0, corruption: 0, shields: 0, waste: 0,
					gold: 0, science: 0, luxury: 0, upkeep: 0, culture: 0, foodSurplus: 0, checked: 0 });
				const gold = i32 (off + 524), sci = i32 (off + 520), lux = i32 (off + 516), sh = i32 (off + 364), wa = i32 (off + 496), net = i32 (off + 504);
				t.cities++; t.citizens += count; t.commerce += i32 (off + 368) + tourist; t.corruption += i32 (off + 500); t.shields += sh; t.waste += wa;
				t.gold += gold + i32 (off + 536); t.science += sci + i32 (off + 532); t.luxury += lux + i32 (off + 528);
				t.upkeep += i32 (off + 20); t.culture += i32 (off + 220); t.foodSurplus += Math.max (0, net);
				if (gold + sci + lux === i32 (off + 512) && sh - wa === i32 (off + 508) && i32 (off + 360) - i32 (off + 492) === net) t.checked++;
			}
			if (owner !== player) continue;

			const flags0 = u8 (off + 24);
			const city = {
				id: i32 (off + 8), x: i16 (off + 12), y: i16 (off + 14), owner,
				name: readAscii (b, off + 392, 24),
				size: count,
				happy: moods[0], content: moods[1], unhappy: moods[2], resisters: moods[3], specialists: moods[4],
				specialistTypes, // citizen type id -> count (1 entertainer, 2 tax collector, 3 scientist, ... in the default rules)
				entertainers: specialistTypes[1] || 0, taxmen: specialistTypes[2] || 0, scientists: specialistTypes[3] || 0,
				specialistOutput: { luxury: i32 (off + 528), science: i32 (off + 532), gold: i32 (off + 536) }, // kept apart from the city's figures
				nationalities,
				disorder: (flags0 & 1) !== 0, celebrating: (flags0 & 2) !== 0,
				storedFood: i32 (off + 40),
				foodTiles: i32 (off + 360), foodEaten: i32 (off + 492), foodNet: i32 (off + 504),
				shields: i32 (off + 364), waste: i32 (off + 496), shieldsStored: i32 (off + 44),
				commerce: i32 (off + 368) + tourist, tileCommerce: i32 (off + 368), touristCommerce: tourist, corruption: i32 (off + 500),
				luxury: i32 (off + 516), science: i32 (off + 520), gold: i32 (off + 524),
				upkeep: i32 (off + 20), culture: i32 (off + 220), pollution: i32 (off + 48),
				buildType: i32 (off + 56), buildId: i32 (off + 52),
				buildings,
				// Share of each unhappiness cause in %, rounded down (memory City +0xCC..+0xD4, written by GOG
				// City_recompute_happiness 0x4BCFF0); all 0 when the city has no unhappy citizen. +1 base (working citizens
				// past the difficulty's content number), +2 war weariness, +3..+8 other causes
				unhappyCauses: Array.from (b.subarray (off + 152, off + 161)),
				raw: { offset: off, specialistsPopd, finalTotal: i32 (off + 512), netShields: i32 (off + 508) }
			};

			// Turns to grow: the city screen's rule (food box = 2 x 10 x (size class + 1) for a human player,
			// halved with accelerated production)
			const sizeClass = city.size > maxCity ? 2 : (city.size > maxTown ? 1 : 0);
			const factor = accelerated ? 5 : 10;
			city.foodBox = 2 * factor * (sizeClass + 1);
			if (city.foodNet <= 0) city.grow = null;
			else {
				const needed = city.foodBox - city.storedFood;
				if (needed <= 0) city.grow = (city.size === maxTown || city.size === maxCity) ? 'max' : 1;
				else city.grow = Math.ceil (needed / city.foodNet);
			}

			// Production
			if (city.buildType === 1) { city.buildName = buildingName (city.buildId); city.buildCost = buildingCost (city.buildId); }
			else if (city.buildType === 2) { city.buildName = unitName (city.buildId); city.buildCost = unitCost (city.buildId); }
			else { city.buildName = city.buildType === 0 ? 'Wealth' : '?'; city.buildCost = null; }
			city.production = Math.floor (Math.max (0, city.shields - city.waste) * result.shieldMult (city.buildings) / 4);
			const netShields = city.production;
			if (city.buildCost && netShields > 0) {
				const cost = accelerated ? Math.ceil (city.buildCost / 2) : city.buildCost;
				city.buildTurns = Math.max (1, Math.ceil ((cost - city.shieldsStored) / netShields));
			} else city.buildTurns = null;

			result.cities.push (city);
		}
		// Foreign citizens: anyone whose nationality isn't the player's civilization. If the civilization wasn't found,
		// use the nationality most common across all the player's cities.
		if (playerRace < 0) {
			const totals = {};
			for (const c of result.cities) for (const [n, k] of Object.entries (c.nationalities)) totals[n] = (totals[n] || 0) + k;
			const best = Object.entries (totals).sort ((a, b) => b[1] - a[1])[0];
			playerRace = best ? +best[0] : -1;
			diag.push (`Guessed civilization number ${playerRace} (most common nationality in your cities)`);
		}
		for (const c of result.cities) c.foreign = c.size - (c.nationalities[playerRace] || 0);
		result.playerRace = playerRace;

		const tourists = result.cities.filter ((c) => c.touristCommerce);
		diag.push (`Year ${result.year === null ? '?' : (result.year < 0 ? -result.year + ' BC' : result.year + ' AD')}; tourist attractions: ` +
		           (tourists.length ? tourists.map ((c) => `${c.name} +${c.touristCommerce} commerce`).join (', ') : 'none'));

		// Commerce replay, verified on a real save (your slider + 4 sample cities, then all cities): commerce left after
		// corruption is split by the slider (luxury and science rounded to the nearest coin, gold gets the rest), then each
		// share is multiplied by its buildings' bonuses added together (+50% each, +100% for research-doubling wonders),
		// rounded down. Specialists' output is kept separately and isn't part of these figures.
		result.econ = null;
		if (rules && result.rates) {
			const R = result.rates;
			const bonus = (set) => {
				let sci = 1, gold = 1, lux = 1;
				for (const k of set) {
					const bd = rules.buildings[k]; if (! bd) continue;
					if (bd.science50) sci += 0.5; if (bd.doublesScience) sci += 1;
					if (bd.gold50) gold += 0.5; if (bd.luxury50) lux += 0.5;
				}
				return { sci, gold, lux };
			};
			// rates: a slider in tenths ({ luxury, science, tax }); the save's slider when not given
			const replay = (net, set, rates = R) => {
				// The game's split (GOG City_recompute_commerce 0x4B07C0): luxury and science rounded (halves up), luxury cut if
				// the two exceed the net, gold gets the rest
				const sci = tdiv (net * rates.science + 5, 10);
				let lux = tdiv (net * rates.luxury + 5, 10);
				if (lux + sci > net) lux = net - sci;
				const gold = net - lux - sci;
				const m = bonus (set);
				return { gold: Math.floor (gold * m.gold + 1e-9), science: Math.floor (sci * m.sci + 1e-9), luxury: Math.floor (lux * m.lux + 1e-9) };
			};
			// Each city: find the commerce that reproduces the game's own gold/science/luxury (the capital, for one, gets
			// commerce that isn't in its city record), and keep any remainder (like Wealth's gold) as a fixed offset.
			let exact = 0;
			for (const c of result.cities) {
				if (! c.buildings) continue;
				const net = c.commerce - c.corruption;
				let best = null;
				for (let n = Math.max (0, net - 5); n <= net + 60; n++) {
					const o = replay (n, c.buildings);
					const err = Math.abs (o.gold - c.gold) + Math.abs (o.science - c.science) + Math.abs (o.luxury - c.luxury) + (n === net ? 0 : 0.5);
					if (! best || err < best.err) best = { n, err, o };
				}
				c.econ = { net: best.n, extraCommerce: best.n - net,
				           offset: { gold: c.gold - best.o.gold, science: c.science - best.o.science, luxury: c.luxury - best.o.luxury } };
				c.econ.exact = c.econ.offset.gold === 0 && c.econ.offset.science === 0 && c.econ.offset.luxury === 0 && c.econ.extraCommerce === 0;
				if (c.econ.exact) exact++;
			}
			result.econ = { replay, bonus };
			const unusual = result.cities.filter ((c) => c.econ && ! c.econ.exact);
			diag.push (`Slider: ${R.science * 10}% science, ${R.tax * 10}% gold, ${R.luxury * 10}% luxury. Gold/science/luxury reproduced exactly in ${exact} of ${result.cities.length} cities` +
			           (unusual.length ? `; calibrated individually: ${unusual.map ((c) => c.name + (c.econ.extraCommerce ? ` (+${c.econ.extraCommerce} commerce)` : '') + (c.econ.offset.gold ? ` (${c.econ.offset.gold > 0 ? '+' : ''}${c.econ.offset.gold} gold${c.buildName === 'Wealth' ? ' from Wealth' : ''})` : '')).join (', ')}` : ''));
		}

		// Self-checks, verified on a real save: gold + luxury + science = the city's final commerce total, and
		// gross shields - waste = net shields. If these fail, the field positions don't fit this file.
		const okCommerce = result.cities.filter ((c) => c.gold + c.luxury + c.science === c.raw.finalTotal).length;
		const okShields = result.cities.filter ((c) => c.shields - c.waste === c.raw.netShields).length;
		diag.push (`Field checks: commerce split adds up in ${okCommerce}/${result.cities.length} cities, shields add up in ${okShields}/${result.cities.length}`);
		result.fieldsOk = okCommerce === result.cities.length && okShields === result.cities.length;

		// Corruption model, for the Courthouse / Police Station what-if
		result.model = null;
		if (rules && world && capitalId >= 0) {
			// The game's distance: wrapped |dx|, |dy|; max - ((dx + dy)/2 - min + 1)/2
			const dist = (a, c) => {
				let dx = Math.abs (a.x - c.x), dy = Math.abs (a.y - c.y);
				if (world.wrapX && dx > tdiv (world.width, 2)) dx = world.width - dx;
				if (world.wrapY && dy > tdiv (world.height, 2)) dy = world.height - dy;
				const hi = Math.max (dx, dy), lo = Math.min (dx, dy);
				return hi - tdiv (tdiv (dx + dy, 2) - lo + 1, 2);
			};
			const capital = result.cities.find ((c) => c.id === capitalId);
			const reducing = rules.buildings.map ((x, k) => x.reducesCorruption ? k : -1).filter ((k) => k >= 0);
			const fpLike = rules.buildings.map ((x, k) => x.forbiddenPalace ? k : -1).filter ((k) => k >= 0);
			const has = (c, k) => c.buildings && c.buildings.has (k);
			const civ = rules.civs[playerRace];
			const diffRow = rules.difficulties[result.difficultyId], gov = rules.governments[government];
			const sizeRow = rules.worldSizes[world.sizeId];
			if (capital && diffRow && gov && sizeRow) {
				for (const c of result.cities) c.capitalDistance = dist (c, capital);
				// Rank: your other cities closer to the capital (equal distance: lower city id first; the game breaks such ties
				// with fields not read here)
				for (const c of result.cities)
					c.rank = result.cities.filter ((o) => o !== c && (o.capitalDistance < c.capitalDistance || (o.capitalDistance === c.capitalDistance && o.id < c.id))).length;
				const ocn = sizeRow.optimalCities, lvl = gov.corruption;
				const palaceWonders = result.cities.reduce ((n, c) => n + fpLike.filter ((k) => has (c, k)).length, 0);
				const commercial = civ ? civ.commercial : false;
				// Leader_get_optimal_city_number for a human player, at a government's corruption level
				const modelAt = (lvl) => {
					let nopt = ocn + tdiv (palaceWonders * ocn * 3, lvl === 5 ? 1 : 8);
					if (commercial) nopt += tdiv (ocn, 4);
					nopt += [tdiv (ocn, 8), tdiv (ocn, 8), tdiv (ocn, 16), 0, 0, 2 * ocn][lvl] || 0;
					nopt = tdiv (nopt * diffRow.optimalPercent, 100);
					return { maxD: tdiv (world.width + world.height, 4), ocn, nopt, govLevel: lvl, cityCount: result.cities.length,
					         commercial, palaceWonders, corruptionPct: diffRow.corruptionPercent ?? 100, dist,
					         fpCities: result.cities.filter ((c) => fpLike.some ((k) => has (c, k))) };
				};
				const m = modelAt (lvl), byLevel = {};
				const mAt = (g) => { const l = rules.governments[g].corruption; return byLevel[l] || (byLevel[l] = modelAt (l)); };
				const courthouse = reducing.find ((k) => /courthouse/i.test (rules.buildings[k].name)), police = reducing.find ((k) => /police/i.test (rules.buildings[k].name));
				for (const c of result.cities) {
					c.isCapital = c === capital;
					c.palaceWondersHere = fpLike.filter ((k) => has (c, k)).length;
					c.reducers = reducing.filter ((k) => has (c, k));
				}
				let match = 0, checked = 0;
				for (const c of result.cities) {
					const ni = c.reducers.length;
					checked++;
					if (corruptedYield (m, c, ni, c.commerce, false).lost === c.corruption && corruptedYield (m, c, ni, c.shields, true).lost === c.waste) match++;
					else c.modelOff = true;
				}
				result.model = { m, courthouse, police, reducing, match, checked,
				                 lostFor: (c, ni, forWaste) => corruptedYield (m, c, ni, forWaste ? c.shields : c.commerce, forWaste).lost,
				                 // Coins or shields lost from yield Y under government g (an index into the rules' governments)
				                 lostAt: (c, ni, forWaste, Y, g) => corruptedYield (mAt (g), c, ni, Y, forWaste).lost,
				                 partsFor: (c, ni, forWaste) => corruptionParts (m, c, ni, forWaste, forWaste ? c.shields : c.commerce) };
				diag.push (`Corruption model (the game's own rule): ${gov.name} (${['minimal', 'nuisance', 'problematic', 'rampant', 'catastrophic', 'communal'][gov.corruption] || '?'}), ` +
				           `${diffRow.name}, ${civ ? civ.noun : '?'}${m.commercial ? ' (Commercial)' : ''}, optimal cities ${m.ocn} -> ${m.nopt} for you, ` +
				           `${m.palaceWonders} Forbidden Palace-type wonder(s)`);
				diag.push (`Corruption model matches the game exactly in ${match} of ${checked} cities` + (match === checked ? '' : ' (cities that don\'t match are marked ~: not connected to the capital, or police specialists)'));
			} else diag.push ('Corruption model: missing capital, difficulty, government or world size');
		}

		// Map tiles (layout from OpenCiv3 QueryCiv3 Tile.cs): one 212-byte record per tile (four headers, the first with
		// length 36), row by row, half the columns per row (x + y is even). Checked: each city's tile holds the city's id.
		// Fresh water: a river on the city tile, or a lake next to it (a water body of at most 20 tiles; the size limit is
		// an assumption, the save tested had only one-tile lakes). Coastal: any water next to the city.
		result.tiles = false;
		if (world && rules && rules.terrains.length) {
			const water = new Set (rules.terrains.map ((n, k) => /coast|sea|ocean/i.test (n) ? k : -1).filter ((k) => k >= 0));
			const first = findAll (b, 'TILE', gameOff).find ((o) => i32 (o + 4) === 36);
			const W = world.width, H = world.height, count = W * H / 2;
			if (first !== undefined && first + 212 * count <= b.length) {
				const tile = (x, y) => { x = ((x % W) + W) % W; if (world.wrapY) y = ((y % H) + H) % H; return y < 0 || y >= H ? -1 : first + 212 * (y * (W / 2) + (x >> 1)); };
				const terrain = (o) => b[o + 57] & 15, isWater = (o) => water.has (terrain (o)), bodyOf = (o) => i16 (o + 34);
				const matched = result.cities.filter ((c) => { const o = tile (c.x, c.y); return o >= 0 && i16 (o + 30) === c.id; }).length;
				if (matched === result.cities.length) {
					const bodySize = {};
					for (let k = 0; k < count; k++) { const o = first + 212 * k; if (isWater (o)) bodySize[bodyOf (o)] = (bodySize[bodyOf (o)] || 0) + 1; }
					const around = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]];
					for (const c of result.cities) {
						const near = around.map (([dx, dy]) => tile (c.x + dx, c.y + dy)).filter ((o) => o >= 0 && isWater (o));
						c.coastal = near.length > 0;
						c.river = b[tile (c.x, c.y) + 8] !== 0;
						c.lake = near.some ((o) => bodySize[bodyOf (o)] <= 20);
						c.freshWater = c.river || c.lake;
					}
					result.tiles = true;

					// Worked tiles and their yields under every government, transcribed from the game (GOG
					// Map_calc_food_yield_at 0x5D7180, Map_calc_shield_yield_at 0x5D75F0, Map_calc_commerce_yield_at 0x5D7AD0).
					// A tile is worked by the city whose id is at tile +104 (OpenCiv3 CityIDOfCitizen); the city tile is one of
					// them. Checked on a save: the sums reproduce every city's food, shields and commerce from tiles. Not on that
					// save, so not checked: pollution (-1 on each yield), Commercial and Seafaring city tiles. Not transcribed:
					// railroads and farmland (+1 with a tech), Golden Age (+1), Colossus-type wonders; a city that has them won't
					// reproduce, and Diagnostics names it.
					const ty = rules.terrainYields, goods = rules.goods, civ = rules.civs[playerRace] || {};
					if (ty.length && rules.governments.every ((g) => g.tilePenalty !== undefined)) {
						const worked = {};
						for (let k = 0; k < count; k++) { const o = first + 212 * k, id = i16 (o + 104); if (id >= 0) (worked[id] = worked[id] || []).push (o); }
						const CITY_FOOD = 2; // the game reads a global (0x9C72B4); 2 reproduces the default rules
						const flagCount = (c, f) => { let n = 0; for (const k of c.buildings || []) if (rules.buildings[k] && rules.buildings[k][f]) n++; return n; };
						const bigSeaNear = (c) => around.some (([dx, dy]) => { const o = tile (c.x + dx, c.y + dy); return o >= 0 && isWater (o) && bodySize[bodyOf (o)] > 20; });
						const yieldOf = (c, o, g) => {
							const t = b[o + 57] >> 4, T = ty[t] || { irrigation: 0, mining: 0, road: 0, food: 0, shields: 0, commerce: 0 }, f2 = b[o + 52];
							const road = f2 & 1, mine = f2 & 4, irrigated = f2 & 8, polluted = f2 & 64, river = b[o + 8] !== 0;
							const water = isWater (o), bigWater = water && bodySize[bodyOf (o)] > 20, isCity = i16 (o + 30) === c.id;
							const res = i32 (o + 12), gd = res >= 0 ? goods[res] : null;
							const gOk = gd && (gd.prereq < 0 || (result.knownTechs && result.knownTechs.has (gd.prereq)));
							const cls = c.size > maxCity ? 2 : (c.size > maxTown ? 1 : 0);
							let food = T.food; if (food > 0 && polluted) food--;
							if (irrigated || isCity) { food += T.irrigation; if (t === 0 && civ.agricultural) food++; } // a city tile counts as irrigated
							if (gOk) food += gd.food;
							if (water) food += bigWater ? flagCount (c, 'foodWater') : 1; // +1 on a lake (20 tiles or fewer)
							if (isCity) food = CITY_FOOD + (civ.agricultural ? 1 : 0);
							if (g.tilePenalty && ! (civ.agricultural && isCity && river) && food > 2) food--;
							let sh = T.shields; if (sh > 0 && polluted) sh--;
							if (mine) sh += T.mining;
							if (gOk) sh += gd.shields;
							if (t === 2 && (b[o + 62] & 1)) sh++; // grassland bonus shield
							if (bigWater) sh += flagCount (c, 'shieldsWater');
							if (isCity) { sh += cls === 1 ? 1 : (cls === 2 ? (civ.industrious ? 3 : 2) : 0); if (sh < 1) sh = 1; }
							if (g.tilePenalty && sh > 2) sh--;
							let com = T.commerce; if (com > 0 && polluted) com--;
							if (road || isCity) com += T.road;
							if (gOk) com += gd.commerce;
							if (river) com++;
							if (bigWater) com += flagCount (c, 'commerceWater');
							if (isCity) {
								com += cls === 1 ? (civ.commercial ? 3 : 1) : (cls === 2 ? (civ.commercial ? 5 : 2) : 0);
								com = Math.max (com, c.id === capitalId ? 4 : 1);
								if (civ.seafaring && bigSeaNear (c)) com++;
							}
							if (g.tradeBonus && com > 0) com++;
							if (g.tilePenalty && com > 2) com--;
							return { food: Math.max (0, food), shields: Math.max (0, sh), commerce: Math.max (0, com) };
						};
						let ok = 0;
						const off = [];
						for (const c of result.cities) {
							const tiles = worked[c.id] || [];
							c.tileYields = rules.governments.map ((g) => tiles.reduce ((a, o) => { const y = yieldOf (c, o, g); return { food: a.food + y.food, shields: a.shields + y.shields, commerce: a.commerce + y.commerce }; }, { food: 0, shields: 0, commerce: 0 }));
							const now = c.tileYields[government];
							c.tilesOk = !! now && now.food === c.foodTiles && now.shields === c.shields && now.commerce === c.tileCommerce;
							if (c.tilesOk) ok++; else off.push (c.name);
						}
						result.tileYields = true;
						diag.push (`Tile yields (the game's rule): worked tiles reproduce food, shields and commerce in ${ok}/${result.cities.length} cities` + (off.length ? `; not in ${off.join (', ')}` : ''));
					}
					diag.push (`Map tiles: city tiles match ${matched}/${result.cities.length}; ${result.cities.filter ((c) => c.coastal).length} coastal cities, ` +
					           `fresh water: ${result.cities.filter ((c) => c.river).length} by a river, ${result.cities.filter ((c) => c.lake && ! c.river).length} by a lake`);
				} else diag.push (`Map tiles: city tiles match only ${matched}/${result.cities.length}; not used`);
			} else diag.push ('Map tiles: not found');
		}

		// Size limits: a town at the town limit needs an Aqueduct-type building, a city at the city limit a Hospital-type
		// building. Cities above the town limit without an Aqueduct exist (fresh water, which the save doesn't show), so a
		// missing building alone isn't proof: growth is blocked for certain only when the food box is full at the limit.
		// atSizeLimit: at a limit without the building (with map tiles: and, at the town limit, without fresh water).
		const size2 = rules ? rules.buildings.map ((x, k) => x.allowsSize2 ? k : -1).filter ((k) => k >= 0) : [];
		const size3 = rules ? rules.buildings.map ((x, k) => x.allowsSize3 ? k : -1).filter ((k) => k >= 0) : [];
		if (rules) diag.push (`Size caps: towns grow past ${maxTown} with ${size2.map ((k) => rules.buildings[k].name).join (' / ') || '(none found)'}, ` +
		                      `cities past ${maxCity} with ${size3.map ((k) => rules.buildings[k].name).join (' / ') || '(none found)'}`);
		for (const c of result.cities) {
			if (rules && c.buildings) {
				if (c.size === maxTown) c.atSizeLimit = ! size2.some ((k) => c.buildings.has (k)) && ! c.freshWater;
				else if (c.size === maxCity) c.atSizeLimit = ! size3.some ((k) => c.buildings.has (k));
				else c.atSizeLimit = false;
			} else c.atSizeLimit = c.grow === 'max';
			c.growthBlocked = c.atSizeLimit && c.grow === 'max';
		}
		result.sizeCaps = { maxTown, maxCity, size2, size3 };

		// Other players (LEAD records: C3X Civ3Conquests.h Leader struct, save offset = memory offset - 20, and OpenCiv3
		// Lead.cs). Checked: every player's city count matches its CITY records; your culture last turn equals the sum of
		// your cities' culture. Each LEAD is followed by its CULT record (total culture, culture last turn).
		// The AI's attitude toward you isn't stored: the game works it out when you open diplomacy.
		result.players = [];
		const leads = findAll (b, 'LEAD', gameOff).filter ((o) => i32 (o + 4) > 4300 && o + 4500 <= b.length);
		const culs = findAll (b, 'CULT', gameOff);
		const mine = leads.find ((o) => i32 (o + 8) === player);
		if (mine && rules) {
			const remaining = i32 (gameOff + 84) >>> 0;
			let cityOk = 0;
			const owners = {};
			// Per owner: the resources its cities reach (CITY +132, one bit per GOOD; the civ's own sources, imports not
			// included: checked, France lacks the Gems and Silks it gets from you) and its cities' gold with tax collectors
			const resMask = {}, cityGold = {};
			for (const off of findAll (b, 'CITY', gameOff)) if (i32 (off + 4) === 136) {
				const o = u8 (off + 16);
				owners[o] = (owners[o] || 0) + 1;
				resMask[o] = (resMask[o] || 0) | i32 (off + 132);
				cityGold[o] = (cityGold[o] || 0) + i32 (off + 524) + i32 (off + 536);
			}
			// AI attitude toward you, transcribed from the game (GOG Leader_get_attitude_toward 0x440100; checked in-game: 4 of 4
			// civilizations). Lower is better. The AI's memory of each player is 19 ints at LEAD +412 + 76 x player (field
			// meanings inferred from the code that writes them). Not decoded: resource deals (-5 each) and the game's AI
			// aggression setting (assumed normal).
			const leadOf = {};
			for (const o of leads) { const id = i32 (o + 8); if (! (id in leadOf)) leadOf[id] = o; }
			const cultureOf = (o) => { const k = leads.indexOf (o), c = culs.find ((x) => x > o && (k + 1 >= leads.length || x < leads[k + 1])); return c ? i32 (c + 12) : 0; };
			const yourNationals = {};
			for (const u of findAll (b, 'UNIT', gameOff)) if (i32 (u + 4) === 472 && i32 (u + 32) === playerRace) yourNationals[i32 (u + 28)] = (yourNationals[i32 (u + 28)] || 0) + 1;
			const M = world ? tdiv (world.width + world.height, 2) : 100, band = tdiv (M, 10);
			const atWarL = (a, k) => b[a + 3356 + k] !== 0;
			const attitudeOf = (A) => {
				const a = leadOf[A], t = mine, T = player, reasons = [];
				const add = (v, why) => { if (v) reasons.push ([why, v]); return v; };
				const civA = rules.civs[i32 (a + 12)] || {}, civT = rules.civs[i32 (t + 12)] || {};
				const rp = (lo, k, i) => i32 (lo + 412 + 76 * k + 4 * i), m = (i) => rp (a, T, i);
				let agg = (civA.aggression || 0) + tdiv (result.difficultyId, 2) - tdiv (rules.difficulties.length, 6);
				agg = Math.max (-2, Math.min (2, agg));
				let s = add (agg, 'aggression');
				s += add (4 * m (0), `you declared war on them${m (0) > 1 ? ` ×${m (0)}` : ''}`);
				s += add (Math.min (4 * m (1), 8), 'deals broken');
				s += add (Math.min (8 * m (2), 16), 'alliances broken');
				s += add (Math.min (2 * m (3), 4), 'treaties broken by war');
				s += add (Math.min (m (5), 10), 'units killed');
				s += add (-Math.min (tdiv (m (9), 10), 10), 'gifts');
				s += add (16 * (2 * m (11) + m (12)), 'pillage');
				s += add (Math.min (m (13), 10) + Math.min (m (14), 10), 'war damage');
				s += add (16 * m (16), 'cities razed');
				s += add (4 * m (4) + 2 * m (6) - m (7) + m (8) - Math.min (m (10), 1) - Math.min (m (15), 10) + m (17) + m (18), 'other memories');
				s += add (yourNationals[A] || 0, 'their units of your nationality');
				if (i32 (t + 3996 + 4 * A)) s += add (10, 'you have allies against them');
				if (i32 (t + 4124 + 4 * A)) s += add (atWarL (a, T) ? 2 : 10, 'your embargo against them');
				if (atWarL (a, T)) s += add (5, 'at war');
				else { const f = i32 (a + 3740 + 4 * T); if (f & 16) s += add (5, 'told to leave'); else if (f & 8) s += add (1, 'asked to leave'); }
				const gT = i32 (t + 140), gA = i32 (a + 140);
				if (gT !== gA) s += add (gT === civA.shunnedGov ? 5 : 1, gT === civA.shunnedGov ? 'you have the government they hate' : 'different government');
				else if (gT === civA.favoriteGov) s += add (-5, 'same government, their favorite');
				const ca = cultureOf (a), ct = cultureOf (t);
				if (ct < tdiv (ca, 2)) s += add (1, 'they have much more culture'); else if (ct > 2 * ca) s += add (-1, 'you have much more culture');
				if (b[a + 3388 + T]) s += add (atWarL (a, T) ? 1 : -2, 'embassy');
				if (civT.cultureGroup === civA.cultureGroup) s += add (-1, 'same culture group');
				const tb = i32 (a + 3868 + 4 * T);
				if ((tb & 4) || (tb & 1)) s += add (-10, 'mutual protection pact');
				if (tb & 2) s += add (-5, 'right of passage');
				let shared = 0;
				for (let j = 1; j < 32; j++) if (leadOf[j] && ((remaining >>> j) & 1) && ((i32 (a + 3996 + 4 * j) >>> T) & 1)) shared++;
				s += add (-2 * shared, 'allied together');
				let common = 0;
				for (let j = 1; j < 32; j++) {
					const lj = leadOf[j];
					if (! lj || ! ((remaining >>> j) & 1) || ! atWarL (a, j)) continue;
					if (atWarL (t, j)) common += -Math.min (rp (lj, T, 14), 1) - 3 - Math.min (rp (lj, T, 4), 2) - Math.min (rp (lj, T, 5), 4) - Math.min (rp (lj, T, 13), 5);
					else if (i32 (t + 4124 + 4 * j)) common -= 2;
				}
				s += add (common, 'common enemies');
				let spread = 0;
				for (let j = 1; j < 32; j++) {
					const lj = leadOf[j];
					if (! lj || j === A || j === T || (atWarL (a, j) && ((remaining >>> j) & 1)) || ! (i32 (a + 3740 + 4 * j) & 1)) continue;
					spread += Math.min (rp (lj, T, 0), 2) + Math.min (rp (lj, T, 1), 2) + Math.min (rp (lj, T, 2), 3) + Math.min (rp (lj, T, 3), 1) + Math.min (rp (lj, T, 16), 8) + Math.min (rp (lj, T, 17), 1);
				}
				s += add (spread, 'your reputation with others');
				if (s < 0 && atWarL (a, T)) { reasons.push (['at war: good feeling ignored', -s]); s = 0; }
				if (s < 0 && i32 (t + 16) > i32 (a + 16)) { reasons.push (['you are stronger: good feeling halved', tdiv (s, 2) - s]); s = tdiv (s, 2); }
				s = Math.max (-M, Math.min (M, s));
				const word = s < -band ? 'Gracious' : s > band ? 'Furious' : s < 0 ? 'Polite' : s === 0 ? 'Cautious' : 'Annoyed';
				return { score: s, word, reasons, band };
			};
			// Trade screen (GOG 0x50FA60): a tech is listed when one side knows it and the other can research it
			// (0x561580: all prerequisites known, its era not later than the receiver's era, LEAD +224) and it may be traded
			// (0x437F80: TECH +104 bit 0x80000 clear). No embassy needed (checked in-game).
			const techsOk = result.knownTechs !== null;
			const knows = (p, t) => ((i32 (techStart + 4 * t) >>> p) & 1) === 1;
			const canReceive = (lo, p, t) => ! knows (p, t) && ! rules.techs[t].noTrade && rules.techs[t].era <= i32 (lo + 224) &&
				rules.techs[t].prereqs.every ((x) => knows (p, x));
			const tradeTechs = (from, to, toLead) => techsOk ? rules.techs.map ((t, k) => knows (from, k) && canReceive (toLead, to, k) ? t.name : null).filter (Boolean) : null;
			const luxuries = (p) => rules.goods.map ((g, k) => g.type === 1 && ((resMask[p] >>> k) & 1) ? g.name : null).filter (Boolean);
			const myLux = luxuries (player);
			// Most gold per turn a civ can offer (GOG 0x55DA60): its cities' gold with tax collectors + gold per turn it gets
			// from other civs + a per-city term and interest (not transcribed: building upkeep and unit costs aren't subtracted)
			const gptIn = (id) => { let n = 0; for (const lo of Object.values (leadOf)) n += Math.max (0, i32 (lo + 3612 + 4 * id)); return n; };
			leads.forEach ((o, k) => {
				const id = i32 (o + 8), race = i32 (o + 12);
				if (id <= 0 || id === player || id >= 32 || race < 0 || ! rules.civs[race]) return;
				const contact = i32 (mine + 3740 + 4 * id);
				if (! contact) return; // never met
				const cult = culs.find ((c) => c > o && (k + 1 >= leads.length || c < leads[k + 1]));
				const alliedAgainstYou = [];
				const bits = i32 (o + 3996 + 4 * player) >>> 0;
				for (let j = 0; j < 32; j++) if ((bits >>> j) & 1) alliedAgainstYou.push (j);
				// Your allies against them: your LEAD +3996 + 4 x their id (checked in-game: Japan and France against the Ottomans
				// and the Celts)
				const yourAllies = [];
				const mineBits = i32 (mine + 3996 + 4 * id) >>> 0;
				for (let j = 0; j < 32; j++) if ((mineBits >>> j) & 1) yourAllies.push (j);
				const cities = i32 (o + 384);
				if (cities === (owners[id] || 0)) cityOk++;
				result.players.push ({
					id, race, name: rules.civs[race].noun, alive: ((remaining >>> id) & 1) === 1,
					government: (rules.governments[i32 (o + 140)] || {}).name || '?', cities,
					culture: cult ? i32 (cult + 12) : null,
					atWar: b[mine + 3356 + id] !== 0, embassy: b[mine + 3388 + id] !== 0,
					alliedAgainstYou, yourAllies,
					// Treaty bits (LEAD +3868): bit1 right of passage (checked in-game: Japan and France, both ways); other bits unknown
					rightOfPassage: ((i32 (mine + 3868 + 4 * id) >>> 1) & 1) === 1,
					attitude: attitudeOf (id),
					// Your war weariness points toward them (LEAD +3228; Leader +0xCB0 in memory)
					warWeariness: i32 (mine + 3228 + 4 * id),
					techsTheyGive: tradeTechs (id, player, mine), techsYouGive: tradeTechs (player, id, o),
					luxTheyHave: luxuries (id).filter ((x) => ! myLux.includes (x)), luxYouHave: myLux.filter ((x) => ! luxuries (id).includes (x)),
					// Treasury: LEAD +48 + +52 (GOG Leader_set_treasury 0x4C2350 splits it in two)
					treasury: i32 (o + 48) + i32 (o + 52), maxGpt: (cityGold[id] || 0) + gptIn (id)
				});
			});
			// War weariness in your cities (GOG 0x4BD780 and 0x4BD6D0), checked against the cause shares the game stores
			{
				const gov = rules.governments[government];
				const level = gov ? gov.warWeariness : 0;
				const enemies = result.players.filter ((p) => p.alive && p.atWar).map ((p) => p.warWeariness);
				const police = new Set (rules.buildings.map ((x, k) => x.reducesWarWeariness ? k : -1).filter ((k) => k >= 0));
				const suffrage = new Set (rules.buildings.map ((x, k) => x.warWearinessWonder ? k : -1).filter ((k) => k >= 0));
				const known = (k) => result.knownTechs ? result.knownTechs.has (k) : false;
				const suffrageCount = [...suffrage].filter ((k) => result.cities.some ((c) => c.buildings && c.buildings.has (k))).length;
				const content = (rules.difficulties[result.difficultyId] || {}).contentCitizens;
				let checked = 0, match = 0;
				for (const c of result.cities) {
					const policeHere = c.buildings ? [...police].filter ((k) => c.buildings.has (k) && ! (rules.buildings[k].obsoleteBy >= 0 && known (rules.buildings[k].obsoleteBy))).length : 0;
					c.warWeariness = warWearinessCity (level, enemies, c.size, policeHere, suffrageCount);
					const s = c.unhappyCauses;
					if (content === undefined || ! s.some ((v) => v) || s[0] || s.slice (3).some ((v) => v)) continue;
					const base = Math.max (0, c.size - c.specialists - content), tot = base + c.warWeariness.unhappy;
					if (! tot) continue;
					checked++;
					if (Math.floor (100 * base / tot) === s[1] && Math.floor (100 * c.warWeariness.unhappy / tot) === s[2]) match++;
					else c.warWeariness.mismatch = true;
				}
				result.warWeariness = { level, government: gov ? gov.name : '?', checked, match, suffrage: suffrageCount };
				diag.push (`War weariness (${gov ? gov.name : '?'}, level ${level}): the formula matches the game's unhappiness causes in ${match}/${checked} cities (the others have no unhappy citizen or another cause)`);
			}
			const myCult = culs.find ((c) => c > mine && (leads.indexOf (mine) + 1 >= leads.length || c < leads[leads.indexOf (mine) + 1]));
			result.myCulture = myCult ? { total: i32 (myCult + 12), perTurn: i32 (myCult + 16) } : null;
			const cityCulture = result.cities.reduce ((n, c) => n + c.culture, 0);
			diag.push (`Players met: ${result.players.length}; city counts match ${cityOk}/${result.players.length}; ` +
			           `your culture last turn ${result.myCulture ? result.myCulture.perTurn : '?'} (sum of your cities: ${cityCulture})`);
		}
		if (result.knownTechs) {
			const building = result.cities.filter ((c) => c.buildType === 1 && rules.buildings[c.buildId]);
			const ok = building.filter ((c) => { const a = rules.buildings[c.buildId].requiredAdvance; return a < 0 || result.knownTechs.has (a); });
			diag.push (`Known techs: ${result.knownTechs.size} of ${rules.techs.length}; buildings in production need a known tech in ${ok.length}/${building.length} cities`);
			if (ok.length !== building.length) { result.knownTechs = null; diag.push ('Known techs don\'t fit this save; not used'); }
		}
		// Other civilizations' totals, for the History comparison. Their food, shields and research are cheaper by the AI
		// cost factor: the game difficulty's (DIFF +104) for an AI player, 10 for a human player. Verified in the GOG exe:
		// food box (Leader_get_food_cost_factor 0x5660E0), units (0x56A210), buildings (0x569FE0), techs (0x569C10, which
		// reads the tech's cost at TECH +68). Known techs per player: the same bits as the player's.
		result.civs = [];
		{
			const diffRow = rules && rules.difficulties[result.difficultyId];
			const techCount = (id) => {
				if (! result.knownTechs) return null;
				let n = 0; for (let k = 0; k < rules.techs.length; k++) if ((i32 (techStart + 4 * k) >>> id) & 1) n++;
				return n;
			};
			const raceOf = {};
			for (const o of findAll (b, 'LEAD', gameOff)) { const id = i32 (o + 8), r = i32 (o + 12); if (id > 0 && id < 32 && ! (id in raceOf)) raceOf[id] = r; }
			let cities = 0, checked = 0;
			for (const [k, t] of Object.entries (civTotals)) {
				const id = +k;
				if (id === 0 || id === player) continue; // 0: barbarians
				const race = raceOf[id], civ = rules && rules.civs[race];
				const human = ((humanBits >>> id) & 1) === 1;
				result.civs.push ({ id, name: civ ? civ.noun : `Player ${id}`, factor: human || ! diffRow ? 10 : diffRow.costFactor,
				                   totals: { ...t, techs: techCount (id) } });
				cities += t.cities; checked += t.checked;
			}
			result.difficultyName = diffRow ? diffRow.name : null;
			diag.push (`Other civilizations: ${result.civs.length} with cities, ${cities} cities; commerce, shields and food add up in ${checked}/${cities}` +
			           (diffRow ? `; AI cost factor ${diffRow.costFactor} (${diffRow.name}), yours 10` : ''));
		}

		// Your units (UNIT records, 472 bytes; OpenCiv3 Unit.cs: +28 owner, +32 nationality = civilization, +40 type) and their
		// gold support, transcribed from the game (GOG Leader_sum_unit_maintenance 0x55D310, get_unit_support_info 0x53A960):
		// units of another nationality and unit types that don't need support are free; the government gives free units per
		// town, city and metropolis; each further unit costs its gold per unit. Checked: the count matches LEAD +376.
		result.units = null; result.unitSupport = null;
		if (rules && rules.units.length) {
			const byType = {};
			let total = 0, free = 0;
			for (const o of findAll (b, 'UNIT', gameOff)) {
				if (i32 (o + 4) !== 472 || i32 (o + 28) !== player) continue;
				const t = rules.units[i32 (o + 40)];
				total++;
				byType[t ? t.name : '?'] = (byType[t ? t.name : '?'] || 0) + 1;
				if (i32 (o + 32) !== playerRace || ! (t && t.requiresSupport)) free++;
			}
			const leadsAll = findAll (b, 'LEAD', gameOff).filter ((o) => i32 (o + 4) > 4300);
			const myLead = leadsAll.find ((o) => i32 (o + 8) === player);
			// Gold per turn from deals (GOG income 0x55DD50 adds, from every other player, its LEAD +3612 + 4 x your player
			// number; in memory the leader +3632 table). What you pay others: your own row (not on the tested save).
			result.goldDeals = { incoming: 0, outgoing: 0, from: [] };
			for (const o of leadsAll) {
				const id = i32 (o + 8);
				if (id <= 0 || id >= 32 || id === player) continue;
				const v = i32 (o + 3612 + 4 * player), name = (rules.civs[i32 (o + 12)] || {}).noun || `Player ${id}`;
				if (v > 0) { result.goldDeals.incoming += v; result.goldDeals.from.push (`${name} ${v}`); }
				if (myLead) { const w = i32 (myLead + 3612 + 4 * id); if (w > 0) result.goldDeals.outgoing += w; }
			}
			const leadCount = myLead ? i32 (myLead + 376) : null;
			result.units = { total, free, byType, leadCount };
			const classes = [0, 0, 0];
			for (const c of result.cities) classes[c.size > maxCity ? 2 : (c.size > maxTown ? 1 : 0)]++;
			result.unitSupport = (g) => {
				const gv = rules.governments[g];
				if (! gv || gv.freeUnits === undefined || gv.freeUnits < 0 || ! result.cities.length) return 0;
				const allowed = gv.freeUnits + classes[0] * gv.freePerSize[0] + classes[1] * gv.freePerSize[1] + classes[2] * gv.freePerSize[2];
				return Math.max (0, total - allowed - free) * gv.unitCost;
			};
			const list = Object.entries (byType).sort ((x, y) => y[1] - x[1]).map (([n, k]) => `${n} ${k}`).join (', ');
			diag.push (`Gold per turn from deals: +${result.goldDeals.incoming}${result.goldDeals.from.length ? ` (${result.goldDeals.from.join (', ')})` : ''}, paid: ${result.goldDeals.outgoing}`);
			diag.push (`Your units: ${total}${leadCount !== null ? ` (the game counts ${leadCount})` : ''}, ${free} free of support (other nationality or no support needed): ${list}. ` +
			           (rules.governments[government] ? `Unit support under ${rules.governments[government].name}: ${result.unitSupport (government)} gold` : ''));
		}

		const okFood = result.cities.filter ((c) => c.foodTiles - c.foodEaten === c.foodNet).length;
		diag.push (`Field check: food from tiles - food eaten = net food in ${okFood}/${result.cities.length} cities`);

		for (const c of result.cities) {
			c.corruptionPct = c.commerce > 0 ? Math.round (100 * c.corruption / c.commerce) : 0;
			c.wastePct = c.shields > 0 ? Math.round (100 * c.waste / c.shields) : 0;
		}

		diag.push (`City records: ${found} read, ${rejected} rejected as malformed; ${result.cities.length} are yours`);
		if (found !== result.numberOfCities)
			diag.push (`Note: the GAME section says ${result.numberOfCities} cities exist but ${found} records were found`);
		result.ok = result.cities.length > 0;
		return result;
	}
	return { parse, parseRulesFile, warWearinessCity };
})();
if (typeof module !== 'undefined') module.exports = Civ3Parse;
