from PIL import Image, ImageDraw, ImageFont
F="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
fnt=ImageFont.truetype(F,26); fp=ImageFont.truetype(F,22)
linhas=[[("adulto","Adulto"),("adulta","Adulta"),("plus_m","Plus-size masc."),("plus_f","Plus-size fem."),("idoso","Idoso"),("idosa","Idosa"),("alto_magro","Alto e magro*")],
        [("musculoso","Musculoso"),("adolescente_m","Adolescente (m)"),("adolescente_f","Adolescente (f)"),("crianca_m","Criança (m)"),("crianca_f","Criança (f)"),("atletica","Atlética*")],
        [("pequeno_m","Bebê 2–3 anos (m)"),("pequena_f","Bebê 2–3 anos (f)"),("bebe_m","Bebê de colo (m)"),("bebe_f","Bebê de colo (f)")]]
W,H=280,520
def grad(im):
    d=ImageDraw.Draw(im)
    for y in range(im.size[1]):
        t=y/im.size[1]; d.line([(0,y),(im.size[0],y)],fill=(int(64-28*t),int(92-40*t),int(150-60*t)))
out=Image.new("RGB",(W*7+40,(H+50)*3+60)); grad(out); d=ImageDraw.Draw(out)
for r,lin in enumerate(linhas):
    for c,(id_,nome) in enumerate(lin):
        im=Image.open(f"out/r_{id_}_media.png").convert("RGBA").resize((W,H),Image.LANCZOS)
        x=20+c*W; y=20+r*(H+50); out.paste(im,(x,y),im)
        tw=d.textlength(nome,font=fnt); d.text((x+(W-tw)/2,y+H+6),nome,fill=(205,214,235),font=fnt)
d.text((20,out.size[1]-34),"* variações além da referência",fill=(185,196,225),font=fp)
out.save("prancha.png")
t=Image.new("RGB",(W*8+40,H+80)); grad(t); d=ImageDraw.Draw(t)
for k,(id_,tom) in enumerate([(i,tm) for i in ("adulta","adulto") for tm in ("clara","media","morena","escura")]):
    im=Image.open(f"out/r_{id_}_{tom}.png").convert("RGBA").resize((W,H),Image.LANCZOS); t.paste(im,(20+k*W,10),im)
    nome={"clara":"Clara","media":"Média","morena":"Morena","escura":"Escura"}[tom]; tw=d.textlength(nome,font=fnt)
    d.text((20+k*W+(W-tw)/2,H+20),nome,fill=(205,214,235),font=fnt)
t.save("tons.png")
