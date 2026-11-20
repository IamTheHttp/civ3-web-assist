// Test encoder for the PKWare DCL format: builds valid compressed streams with known content.
const MAXBITS = 13;
function canon (rep) {
	const length = [];
	for (const r of rep) for (let k = (r >> 4) + 1; k > 0; k--) length.push (r & 15);
	const count = new Array (MAXBITS + 1).fill (0);
	for (const l of length) count[l]++;
	const order = length.map ((l, s) => [l, s]).filter (([l]) => l > 0).sort ((a, b) => a[0] - b[0] || a[1] - b[1]);
	const codes = {};
	let first = 0, idx = 0;
	for (let len = 1; len <= MAXBITS; len++) {
		for (let k = 0; k < count[len]; k++) codes[order[idx++][1]] = { code: first + k, len };
		first = (first + count[len]) << 1;
	}
	return codes;
}
const LIT = canon ([11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45, 44, 173]);
const LEN = canon ([2, 35, 36, 53, 38, 23]), DIST = canon ([2, 20, 53, 230, 247, 151, 248]);
const base = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264], extra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
function encode (ops, litMode, dict) {
	const bytes = []; let acc = 0, n = 0;
	const put = (v, count) => { for (let i = 0; i < count; i++) { acc |= ((v >> i) & 1) << n; if (++n === 8) { bytes.push (acc); acc = 0; n = 0; } } };
	const putCode = (c) => { for (let i = c.len - 1; i >= 0; i--) put (1 - ((c.code >> i) & 1), 1); };
	const putLen = (len) => { for (let s = 15; s >= 0; s--) if (len >= base[s] && len < base[s] + (1 << extra[s])) { putCode (LEN[s]); put (len - base[s], extra[s]); return; } throw new Error ('len ' + len); };
	put (litMode, 8); put (dict, 8);
	for (const op of ops) {
		if (op.lit !== undefined) { put (0, 1); if (litMode) putCode (LIT[op.lit]); else put (op.lit, 8); }
		else {
			put (1, 1); putLen (op.len);
			const dbits = op.len === 2 ? 2 : dict, d = op.dist - 1;
			putCode (DIST[d >> dbits]); put (d & ((1 << dbits) - 1), dbits);
		}
	}
	put (1, 1); putLen (519);
	if (n) bytes.push (acc);
	return Uint8Array.from (bytes);
}
// Random program of literals and back-references; returns [compressed, expected plaintext]
function randomStream (size, litMode, dict) {
	const ops = [], plain = [];
	const maxDist = (op_len) => (op_len === 2 ? (64 << 2) : (64 << dict));
	while (plain.length < size) {
		if (plain.length > 0 && Math.random () < 0.45) {
			const len = Math.random () < 0.15 ? 2 : 3 + Math.floor (Math.random () * Math.random () * 515);
			const dist = 1 + Math.floor (Math.random () * Math.min (plain.length, maxDist (len)));
			ops.push ({ len, dist });
			for (let k = 0; k < len; k++) plain.push (plain[plain.length - dist]);
		} else {
			const b = Math.floor (Math.random () * 256);
			ops.push ({ lit: b }); plain.push (b);
		}
	}
	return [encode (ops, litMode, dict), Uint8Array.from (plain)];
}
module.exports = { randomStream, encodeOps: encode };
