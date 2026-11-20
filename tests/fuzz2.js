const B = require ('../src/blast.js'), E = require ('./encode.js'), { spawnSync } = require ('child_process');
let pass = 0, fail = 0, bytes = 0;
for (let i = 0; i < +process.argv[2]; i++) {
	const litMode = i & 1, dict = 4 + (i % 3), size = 1000 + Math.floor (Math.random () * 60000);
	const [comp, plain] = E.randomStream (size, litMode, dict);
	const j = B.decompress (comp), c = spawnSync (__dirname + '/cblast', { input: comp, maxBuffer: 1 << 26 });
	const okJ = j.err === 0 && Buffer.compare (Buffer.from (j.data), Buffer.from (plain)) === 0;
	const okC = +c.stderr.toString () === 0 && Buffer.compare (c.stdout, Buffer.from (plain)) === 0;
	if (okJ && okC) { pass++; bytes += plain.length; }
	else { fail++; if (fail < 4) console.log ('FAIL', { litMode, dict, size, jsErr: j.err, jsLen: j.data.length, cErr: c.stderr.toString (), cLen: c.stdout.length, okJ, okC }); }
}
console.log (`${pass} passed, ${fail} failed; ${(bytes / 1e6).toFixed (1)} MB of known content decoded identically by C and JS`);
