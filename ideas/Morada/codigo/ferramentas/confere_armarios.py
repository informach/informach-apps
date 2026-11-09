import json, sys
SP = sys.argv[1]
tot = 0
for c in ("armarios", "estantes", "sapateiras", "racks_tv"):
    d = json.load(open(f"{SP}/moveis_out/{c}/catalogo.json"))
    its = d["itens"]; tot += len(its)
    grupos = {}
    for it in its:
        grupos.setdefault(it["grupo"], []).append(it["id"])
        L, H, P = it["dims"][0], it["dims"][2], it["dims"][1]
        par = it["fixacao"] == "parede"
        y0, y1 = (-P - 0.01, 0.01) if par else (-P / 2 - 0.06, P / 2 + 0.01)
        prob = []
        for s in it["slots"]:
            if s["em"]:
                continue
            bx, by, bz = s["centro"][0], -s["centro"][2], s["centro"][1]
            if not (-L / 2 <= bx <= L / 2 and y0 <= by <= y1 and -0.01 <= bz <= H + 0.05):
                prob.append(("slot", s["nome"], (round(bx, 3), round(by, 3), round(bz, 3))))
        for i in it["interativos"]:
            bx, by, bz = i["pivo"][0], -i["pivo"][2], i["pivo"][1]
            if not (-L / 2 - 0.01 <= bx <= L / 2 + 0.01 and y0 - 0.05 <= by <= y1 and -0.01 <= bz <= H + 0.01):
                prob.append(("pivo", i["nome"], (round(bx, 3), round(by, 3), round(bz, 3))))
        if par and "altura_instalacao" not in it:
            prob.append("sem altura")
        tipos = {}
        for i in it["interativos"]:
            tipos[i["interativo"]] = tipos.get(i["interativo"], 0) + 1
        print(f"{c:10s} {it['id']:42s} dims={it['dims']} tris={it['tris']:5d} int={tipos} slots={len(it['slots'])}",
              "PROB" if prob else "", prob if prob else "")
    print(c, len(its), "pecas,", len(grupos), "grupos")
print("total", tot)
