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
				foodWater: (b[e + 239] & 1) !== 0, shieldsWater: ((b[e + 238] >> 7) & 1) !== 0, commerceWater: ((b[e + 239] >> 1) & 1) !== 0 })),
			// TERR: name after a bitmap of possible resources (one bit each, rounded up to bytes)
			terrains: terr ? terr.map ((e) => readAscii (b, e + 8 + Math.ceil (i32 (e + 4) / 8), 32)) : [],
			// Yields (OpenCiv3 Terr.cs): after the name and civilopedia entry
			terrainYields: terr ? terr.map ((e) => { const t = e + 8 + Math.ceil (i32 (e + 4) / 8);
				return { irrigation: i32 (t + 64), mining: i32 (t + 68), road: i32 (t + 72), food: i32 (t + 84), shields: i32 (t + 88), commerce: i32 (t + 92) }; }) : [],
			// Resources (OpenCiv3 Good.cs): prerequisite tech and the yield they add
			goods: good ? good.map ((e) => ({ name: readAscii (b, e + 4, 24), prereq: i32 (e + 76), food: i32 (e + 80), shields: i32 (e + 84), commerce: i32 (e + 88) })) : [],
			techs: tech ? tech.map ((e) => ({ name: readAscii (b, e + 4, 32) })) : [],
			units: prto ? prto.map ((e) => ({ name: readAscii (b, e + 8, 32), cost: i32 (e + 84) })) : [],
			// OpenCiv3 Govt.cs: +12 buildings need maintenance, +20 tile penalty (-1 on a yield above 2), +24 trade bonus
			// (+1 commerce on a tile with commerce)
			governments: govt.map ((e) => ({ name: readAscii (b, e + 28, 64), corruption: i32 (e + 380), maintenance: i32 (e + 12) !== 0,
				tilePenalty: i32 (e + 20) !== 0, tradeBonus: i32 (e + 24) !== 0 })),
			difficulties: diff.map ((e) => ({ name: readAscii (b, e + 4, 64), costFactor: i32 (e + 104), optimalPercent: i32 (e + 108), corruptionPercent: i32 (e + 116) })),
			worldSizes: wsiz.map ((e) => ({ optimalCities: i32 (e + 4) })),
			civs: [], maxTown: 6, maxCity: 12
		};
		if (rule) {
			const t = i32 (rule[0] + 288), c = i32 (rule[0] + 292);
			if (t > 0 && c > t && c < 1000) { r.maxTown = t; r.maxCity = c; }
		}
		if (race) for (const e of race) {
			// City and great-leader name lists, and 4 eras x 520 bytes of artwork paths, come before the fixed fields
			const n = i32 (e + 4), m = i32 (e + 8 + 24 * n), shift = 24 * n + 32 * m;
			const traits = b[e + 272 + 2080 + shift];
			r.civs.push ({ noun: readAscii (b, e + 180 + shift, 40), commercial: (traits & 2) !== 0, industrious: (traits & 32) !== 0,
			               agricultural: (traits & 64) !== 0, seafaring: (traits & 128) !== 0 });
		}
		return r;
	}

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
			// Totals per civilization (every owner), for the History comparison. Same fields as the player's cities;
			// specialists' output added as in the player's totals. A city counts as checked when its commerce split,
			// shields and food add up.
			{
				const t = civTotals[owner] || (civTotals[owner] = { cities: 0, citizens: 0, commerce: 0, corruption: 0, shields: 0, waste: 0,
					gold: 0, science: 0, luxury: 0, upkeep: 0, culture: 0, foodSurplus: 0, checked: 0 });
				const gold = i32 (off + 524), sci = i32 (off + 520), lux = i32 (off + 516), sh = i32 (off + 364), wa = i32 (off + 496), net = i32 (off + 504);
				t.cities++; t.citizens += count; t.commerce += i32 (off + 368); t.corruption += i32 (off + 500); t.shields += sh; t.waste += wa;
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
				commerce: i32 (off + 368), corruption: i32 (off + 500),
				luxury: i32 (off + 516), science: i32 (off + 520), gold: i32 (off + 524),
				upkeep: i32 (off + 20), culture: i32 (off + 220), pollution: i32 (off + 48),
				buildType: i32 (off + 56), buildId: i32 (off + 52),
				buildings,
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
			const netShields = city.shields - city.waste;
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

		// Commerce replay, verified on a real save (your slider + 4 sample cities, then all cities): commerce left after
		// corruption is split by the slider (luxury and gold rounded to the nearest coin, science gets the rest), then each
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
				const lux = Math.floor (net * rates.luxury / 10 + 0.5), gold = Math.floor (net * rates.tax / 10 + 0.5), sci = net - lux - gold;
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
							c.tilesOk = !! now && now.food === c.foodTiles && now.shields === c.shields && now.commerce === c.commerce;
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
			for (const off of findAll (b, 'CITY', gameOff)) if (i32 (off + 4) === 136) owners[u8 (off + 16)] = (owners[u8 (off + 16)] || 0) + 1;
			leads.forEach ((o, k) => {
				const id = i32 (o + 8), race = i32 (o + 12);
				if (id <= 0 || id === player || id >= 32 || race < 0 || ! rules.civs[race]) return;
				const contact = i32 (mine + 3740 + 4 * id);
				if (! contact) return; // never met
				const cult = culs.find ((c) => c > o && (k + 1 >= leads.length || c < leads[k + 1]));
				const alliedAgainstYou = [];
				const bits = i32 (o + 3996 + 4 * player) >>> 0;
				for (let j = 0; j < 32; j++) if ((bits >>> j) & 1) alliedAgainstYou.push (j);
				const cities = i32 (o + 384);
				if (cities === (owners[id] || 0)) cityOk++;
				result.players.push ({
					id, race, name: rules.civs[race].noun, alive: ((remaining >>> id) & 1) === 1,
					government: (rules.governments[i32 (o + 140)] || {}).name || '?', cities,
					culture: cult ? i32 (cult + 12) : null,
					atWar: b[mine + 3356 + id] !== 0, embassy: b[mine + 3388 + id] !== 0,
					warDeclarations: i32 (mine + 412 + 76 * id), // times this player declared war on you
					alliedAgainstYou
				});
			});
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
	return { parse, parseRulesFile };
})();
if (typeof module !== 'undefined') module.exports = Civ3Parse;
