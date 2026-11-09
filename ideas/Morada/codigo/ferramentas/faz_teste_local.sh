#!/bin/bash
# página local para os testes: three.js da pasta _three e charset (no artefato o esqueleto da página já põe)
cd "$(dirname "$0")/../corpos_viewer"
{ echo '<meta charset="utf-8">'; sed 's#https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js#./_three/node_modules/three/build/three.module.js#; s#https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/#./_three/node_modules/three/examples/jsm/#' corpos.html; } > teste_local.html
