import sys, os
sys.path.insert(0, sys.argv[sys.argv.index("--") + 1])
import bpy
import moveis_base as mb
a = sys.argv[sys.argv.index("--") + 2:]
op = a[2:]
mb.vitrine(a[0], a[1], abertos="abertos" in op, noite="noite" in op)
