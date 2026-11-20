# Prints a function of the Civ3 exe with called functions named from C3X's civ_prog_objects.csv.
# Usage: python3 -I tools/disasm.py <Civ3Conquests.exe> <civ_prog_objects.csv> <hex address> <instruction count>
# Needs: pip install capstone pefile. See docs/learnings/reverse-engineering.md.
import sys, pefile, capstone
exe, csvp, va0, n = sys.argv[1], sys.argv[2], int(sys.argv[3], 16), int(sys.argv[4])
pe = pefile.PE(exe); base = pe.OPTIONAL_HEADER.ImageBase
names = {}
for line in open(csvp, encoding='utf-8', errors='replace'):
    p = [x.strip().strip('"') for x in line.split(',')]
    if len(p) >= 5:
        try: names[int(p[1], 16)] = p[4]
        except ValueError: pass
def read(va, k):
    for s in pe.sections:
        if s.VirtualAddress <= va - base < s.VirtualAddress + s.Misc_VirtualSize:
            off = s.PointerToRawData + (va - base - s.VirtualAddress); return pe.__data__[off:off+k]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
k = 0
for i in md.disasm(read(va0, 6000), va0):
    extra = ''
    if i.mnemonic in ('call', 'jmp') and i.op_str.startswith('0x'):
        t = int(i.op_str, 16); extra = '  ; ' + names.get(t, '')
    for a, nm in names.items():
        if hex(a) in i.op_str and i.mnemonic not in ('call', 'jmp'): extra += f'  ; [{nm}]'
    print(f'{i.address:#x}: {i.mnemonic} {i.op_str}{extra}'); k += 1
    if k >= n: break
