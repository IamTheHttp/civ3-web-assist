// PKWare DCL "implode" decompressor, a direct port of blast.c by Mark Adler (zlib contrib/blast, zlib license).
// Civilization III compresses SAV and BIQ files with this format.
const Blast = (() => {
	const MAXBITS = 13;
	function construct (rep) {
		const length = [];
		for (const r of rep) {
			const len = r & 15;
			for (let k = (r >> 4) + 1; k > 0; k--) length.push (len);
		}
		const n = length.length;
		const count = new Int16Array (MAXBITS + 1), symbol = new Int16Array (n);
		for (const l of length) count[l]++;
		const offs = new Int16Array (MAXBITS + 1);
		offs[1] = 0;
		for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
		for (let s = 0; s < n; s++) if (length[s] !== 0) symbol[offs[length[s]]++] = s;
		return { count, symbol };
	}
	const litcode = construct ([11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8,
		9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5,
		7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12,
		8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27,
		44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45,
		44, 173]);
	const lencode = construct ([2, 35, 36, 53, 38, 23]);
	const distcode = construct ([2, 20, 53, 230, 247, 151, 248]);
	const base = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
	const extra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];

	class OutOfInput extends Error {}

	// Returns { data: Uint8Array, err } with err as in blast.c: 0 ok, 2 out of input, -1 bad literal flag,
	// -2 bad dictionary size, -3 distance too far back, -9 bad code
	function decompress (input) {
		let pos = 0, bitbuf = 0, bitcnt = 0;
		let out = new Uint8Array (Math.max (1024, input.length * 4)), next = 0;
		const ensure = (n) => {
			if (next + n > out.length) {
				let size = out.length * 2;
				while (size < next + n) size *= 2;
				const bigger = new Uint8Array (size);
				bigger.set (out.subarray (0, next));
				out = bigger;
			}
		};
		const bits = (need) => {
			let val = bitbuf;
			while (bitcnt < need) {
				if (pos >= input.length) throw new OutOfInput ();
				val |= input[pos++] << bitcnt;
				bitcnt += 8;
			}
			bitbuf = val >>> need;
			bitcnt -= need;
			return val & ((1 << need) - 1);
		};
		const decode = (h) => {
			let bb = bitbuf, left = bitcnt, code = 0, first = 0, index = 0, len = 1, nextIdx = 1;
			while (true) {
				while (left--) {
					code |= (bb & 1) ^ 1;
					bb >>>= 1;
					const count = h.count[nextIdx++];
					if (code < first + count) {
						bitbuf = bb;
						bitcnt = (bitcnt - len) & 7;
						return h.symbol[index + (code - first)];
					}
					index += count;
					first += count;
					first <<= 1;
					code <<= 1;
					len++;
				}
				left = (MAXBITS + 1) - len;
				if (left === 0) break;
				if (pos >= input.length) throw new OutOfInput ();
				bb = input[pos++];
				if (left > 8) left = 8;
			}
			return -9;
		};
		let err = 0;
		try {
			const lit = bits (8);
			if (lit > 1) err = -1;
			else {
				const dict = bits (8);
				if (dict < 4 || dict > 6) err = -2;
				else {
					while (true) {
						if (bits (1)) {
							const sym = decode (lencode);
							if (sym < 0) { err = sym; break; }
							let len = base[sym] + bits (extra[sym]);
							if (len === 519) break;
							const dbits = len === 2 ? 2 : dict;
							const dsym = decode (distcode);
							if (dsym < 0) { err = dsym; break; }
							let dist = (dsym << dbits) + bits (dbits) + 1;
							if (dist > next && next < 4096) { err = -3; break; } // still inside the first window
							if (dist > next) { err = -3; break; }
							ensure (len);
							for (; len > 0; len--, next++) out[next] = out[next - dist];
						} else {
							const sym = lit ? decode (litcode) : bits (8);
							if (sym < 0) { err = sym; break; }
							ensure (1);
							out[next++] = sym;
						}
					}
				}
			}
		} catch (e) {
			if (e instanceof OutOfInput) err = 2; else throw e;
		}
		return { data: out.slice (0, next), err };
	}
	return { decompress };
})();
if (typeof module !== 'undefined') module.exports = Blast;
