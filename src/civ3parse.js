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
		const bldg = sec ('BLDG'), prto = sec ('PRTO'), rule = sec ('RULE'), govt = sec ('GOVT'), diff = sec ('DIFF'),
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
				wonder: (b[e + 240] & 0b1100) !== 0 })),
			units: prto ? prto.map ((e) => ({ name: readAscii (b, e + 8, 32), cost: i32 (e + 84) })) : [],
			governments: govt.map ((e) => ({ name: readAscii (b, e + 28, 64), corruption: i32 (e + 380) })),
			difficulties: diff.map ((e) => ({ name: readAscii (b, e + 4, 64), optimalPercent: i32 (e + 108) })),
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
			r.civs.push ({ noun: readAscii (b, e + 180 + shift, 40), commercial: (b[e + 272 + 2080 + shift] & 2) !== 0 });
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

	// Corruption and waste, the community formula (Apolyton/CivFanatics). Verified against a real save: within one coin
	// or shield of the game in every city. Returns the parts of the share lost: distance part, rank part, the cap, and
	// share = min(distance + rank, cap), all 0..1.
	function corruptionParts (m, city, ni, forWaste) {
		if (city.isCapital) return { dist: 0, rank: 0, cap: 0, share: 0 };
		const lvl = m.govLevel;
		if (lvl === 4 || lvl > 5) return null; // Catastrophic (Anarchy) or unknown: not covered by the formula
		const communal = lvl === 5;
		const gd = lvl === 3 ? 1.5 : (lvl === 0 ? 0.75 : 1.0), gr = communal ? 2 : ((lvl === 0 || lvl === 1) ? 0.1 : 0), gp = communal ? 1 : 3 / 8;
		const celebrating = forWaste && city.celebrating;
		let d = communal ? Math.floor (m.maxD / 4) : city.palaceDistance;
		let da = Math.min (gd * d, m.maxD) * Math.pow (0.5, ni);
		if (celebrating) da /= 2;
		const R = communal ? Math.floor (m.cityCount / 2) : city.rank;
		let nopt = m.ocn * (m.difficulty * (1 + (m.commercial ? 0.25 : 0) + gr + gp * m.palaceWonders) + 0.25 * ni);
		if (celebrating) nopt += m.ocn / 4;
		const rankPart = R < nopt ? R / (2 * nopt) : (2 * R - nopt) / (2 * nopt);
		const cap = Math.max (0.9 - 0.1 * ni - 0.7 * city.palaceWondersHere, 0);
		const dist = da / m.maxD;
		return { dist, rank: rankPart, cap, share: Math.min (dist + rankPart, cap) };
	}
	function corruptionShare (m, city, ni, forWaste) {
		const p = corruptionParts (m, city, ni, forWaste);
		return p && p.share;
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
			const replay = (net, set) => {
				const lux = Math.floor (net * R.luxury / 10 + 0.5), gold = Math.floor (net * R.tax / 10 + 0.5), sci = net - lux - gold;
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
			const all = [];
			for (const off of findAll (b, 'CITY', gameOff))
				if (i32 (off + 4) === 136 && u8 (off + 16) === player) all.push ({ id: i32 (off + 8), x: i16 (off + 12), y: i16 (off + 14) });
			const dist = (a, c) => {
				let dx = Math.abs (a.x - c.x), dy = Math.abs (a.y - c.y);
				if (world.wrapX) dx = Math.min (dx, world.width - dx);
				if (world.wrapY) dy = Math.min (dy, world.height - dy);
				const p = (dx + dy) >> 1, q = Math.abs (dx - dy) >> 1;
				return Math.max (p, q) + (Math.min (p, q) >> 1);
			};
			const capital = result.cities.find ((c) => c.id === capitalId);
			const reducing = rules.buildings.map ((x, k) => x.reducesCorruption ? k : -1).filter ((k) => k >= 0);
			const fpLike = rules.buildings.map ((x, k) => x.forbiddenPalace ? k : -1).filter ((k) => k >= 0);
			const has = (c, k) => c.buildings && c.buildings.has (k);
			const palaces = result.cities.filter ((c) => c === capital || fpLike.some ((k) => has (c, k)));
			const civ = rules.civs[playerRace];
			const diffRow = rules.difficulties[result.difficultyId], gov = rules.governments[government];
			const sizeRow = rules.worldSizes[world.sizeId];
			if (capital && diffRow && gov && sizeRow) {
				const order = [...result.cities].sort ((a, c) => dist (a, capital) - dist (c, capital) || a.id - c.id);
				order.forEach ((c, k) => { c.rank = k; });
				const m = { maxD: Math.floor ((world.width + world.height) / 4), ocn: sizeRow.optimalCities,
				            difficulty: diffRow.optimalPercent / 100, commercial: civ ? civ.commercial : false,
				            govLevel: gov.corruption, cityCount: result.cities.length,
				            palaceWonders: result.cities.reduce ((n, c) => n + fpLike.filter ((k) => has (c, k)).length, 0) };
				const courthouse = reducing.find ((k) => /courthouse/i.test (rules.buildings[k].name)), police = reducing.find ((k) => /police/i.test (rules.buildings[k].name));
				for (const c of result.cities) {
					c.isCapital = c === capital;
					c.palaceDistance = Math.min (...palaces.map ((p) => dist (c, p)));
					c.palaceWondersHere = fpLike.filter ((k) => has (c, k)).length;
					c.reducers = reducing.filter ((k) => has (c, k));
				}
				let match = 0, checked = 0;
				for (const c of result.cities) {
					const ni = c.reducers.length;
					const pc = corruptionShare (m, c, ni, false), pw = corruptionShare (m, c, ni, true);
					if (pc === null) continue;
					checked++;
					if (Math.abs (Math.round (c.commerce * pc) - c.corruption) <= 1 && Math.abs (Math.floor (c.shields * pw + 1e-9) - c.waste) <= 1) match++;
					else c.modelOff = true;
				}
				result.model = { m, courthouse, police, reducing, match, checked,
				                 shareFor: (c, ni, forWaste) => corruptionShare (m, c, ni, forWaste),
				                 partsFor: (c, ni, forWaste) => corruptionParts (m, c, ni, forWaste) };
				diag.push (`Corruption model: ${gov.name} (${['minimal', 'nuisance', 'problematic', 'rampant', 'catastrophic', 'communal'][gov.corruption] || '?'}), ` +
				           `${diffRow.name}, ${civ ? civ.noun : '?'}${m.commercial ? ' (Commercial)' : ''}, optimal cities ${m.ocn}, ` +
				           `${m.palaceWonders} Forbidden Palace-type wonder(s)`);
				diag.push (`Corruption model matches the game within 1 in ${match} of ${checked} cities` + (match === checked ? '' : ' (cities that don\'t match are marked ~)'));
			} else diag.push ('Corruption model: missing capital, difficulty, government or world size');
		}

		// Growth blocked by the size cap: a town at the town limit needs an Aqueduct-type building, a city at the city
		// limit a Hospital-type building. Without rules, only a full food box at a size limit counts.
		const size2 = rules ? rules.buildings.map ((x, k) => x.allowsSize2 ? k : -1).filter ((k) => k >= 0) : [];
		const size3 = rules ? rules.buildings.map ((x, k) => x.allowsSize3 ? k : -1).filter ((k) => k >= 0) : [];
		if (rules) diag.push (`Size caps: towns grow past ${maxTown} with ${size2.map ((k) => rules.buildings[k].name).join (' / ') || '(none found)'}, ` +
		                      `cities past ${maxCity} with ${size3.map ((k) => rules.buildings[k].name).join (' / ') || '(none found)'}`);
		for (const c of result.cities) {
			if (rules && c.buildings) {
				if (c.size === maxTown) c.growthBlocked = ! size2.some ((k) => c.buildings.has (k));
				else if (c.size === maxCity) c.growthBlocked = ! size3.some ((k) => c.buildings.has (k));
				else c.growthBlocked = false;
			} else c.growthBlocked = c.grow === 'max';
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
