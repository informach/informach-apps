import sys, os
sys.path.insert(0, sys.argv[sys.argv.index("--") + 1])
import bpy
import moveis_base as mb
a = sys.argv[sys.argv.index("--") + 2:]
mb.vitrine(a[0], a[1], abertos=(len(a) > 2 and a[2] == "abertos"))
