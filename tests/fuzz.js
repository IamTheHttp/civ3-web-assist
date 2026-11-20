const B = require ('../src/blast.js'), { execFileSync, spawnSync } = require ('child_process'), crypto = require ('crypto');
let same = 0, diff = 0, ok = 0, total = 0, maxOut = 0;
const N = +process.argv[2] || 3000;
for (let i = 0; i < N; i++) {
	const len = 4 + Math.floor (Math.random () * 600);
	const buf = crypto.randomBytes (len);
	if (i % 3 !== 0) { buf[0] = Math.random () < 0.5 ? 0 : 1; buf[1] = 4 + Math.floor (Math.random () * 3); }
	const c = spawnSync (__dirname + '/cblast', { input: buf });
	const j = B.decompress (buf);
	const cerr = +c.stderr.toString ();
	total++;
	if (cerr === j.err && Buffer.compare (c.stdout, Buffer.from (j.data)) === 0) { same++; if (cerr === 0) ok++; maxOut = Math.max (maxOut, j.data.length); }
	else { diff++; if (diff < 4) console.log ('MISMATCH', buf.toString ('hex').slice (0, 80), 'C err', cerr, 'len', c.stdout.length, 'JS err', j.err, 'len', j.data.length); }
}
console.log (`${total} random streams: ${same} identical, ${diff} different; ${ok} decoded to the end marker; largest output ${maxOut} bytes`);
