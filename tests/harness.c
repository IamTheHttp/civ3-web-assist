#include <stdio.h>
#include <stdlib.h>
#include "blast.h"
static unsigned char in[1<<16]; static unsigned inlen;
static unsigned infun (void * how, unsigned char ** buf) { static int done; if (done) return 0; done = 1; *buf = in; return inlen; }
static int outfun (void * how, unsigned char * buf, unsigned len) { fwrite (buf, 1, len, stdout); return 0; }
int main () { inlen = fread (in, 1, sizeof in, stdin); int err = blast (infun, NULL, outfun, NULL); fprintf (stderr, "%d", err); return 0; }
