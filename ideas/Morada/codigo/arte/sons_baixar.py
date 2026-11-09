"""Baixa pacotes de som CC0 do OpenGameArt, cada um numa pasta própria e vazia.

Só aceita itens cuja ficha lista a licença CC0. Grava sons_dl/_fichas.json com fonte, URL, autor e licença.
Uso: python -I sons_baixar.py fichas            (só lê as fichas)
     python -I sons_baixar.py baixar slug1 ...  (baixa os arquivos dos itens CC0)
     python -I sons_baixar.py baixar --so=a.wav,b.wav slug   (só esses arquivos do item)
Nada do que é baixado é executado.
"""
import json, os, re, subprocess, sys, html

SP = "/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad"
DL = os.path.join(SP, "sons_dl")
FICHAS = os.path.join(DL, "_fichas.json")

SLUGS = [
    "interface-sounds", "51-ui-sound-effects-buttons-switches-and-clicks", "50-rpg-sound-effects",
    "54-casino-sound-effects-cards-dice-chips", "85-short-music-jingles",
    "dog-barking-mono", "dog-sounds", "cat-purr-meow", "kitten-mew", "meow",
    "80-cc0-creature-sfx", "gorilla-sounds", "ambient-bird-sounds", "birdcricketfrog-and-mosquito-sounds",
    "solo-seagull-sound-effects", "crickets-ambient-noise-loopable", "beach-ocean-waves", "water-waves",
    "100-cc0-sfx", "100-cc0-sfx-2", "general-household-sound-effects", "202-more-sound-effects",
    "doorbell", "doorbell-ring", "different-steps-on-wood-stone-leaves-gravel-and-mud",
]


def get(url):
    return subprocess.run(["curl", "-sS", "-L", "--max-time", "60", url], capture_output=True, check=True).stdout.decode("utf-8", "replace")


def ficha(slug):
    url = f"https://opengameart.org/content/{slug}"
    s = get(url)
    t = re.search(r"<title>([^<]*)</title>", s)
    i = s.find("field-name-field-art-licenses")
    lic = re.findall(r"class='license-name'>([^<]+)<", s[i:i + 4000]) if i >= 0 else []
    lic_url = re.findall(r"href='(https?://creativecommons[^']+)'", s[i:i + 4000]) if i >= 0 else []
    j = s.find("field-name-author-submitter")
    autor = re.findall(r'href="/users/[^"]+"[^>]*>([^<]+)<', s[j:j + 1500])[:1] if j >= 0 else []
    k = s.find("field-name-field-art-files")
    arqs = sorted(set(re.findall(r'href="(https://opengameart.org/sites/default/files/[^"]+)"', s[k:k + 20000]))) if k >= 0 else []
    d = re.search(r'field-name-body.*?<p>(.*?)</div>', s, re.S)
    desc = html.unescape(re.sub(r"<[^>]+>", " ", d.group(1)))[:600] if d else ""
    return {"slug": slug, "titulo": html.unescape(t.group(1).split("|")[0].strip()) if t else slug, "url": url,
            "autor": html.unescape(autor[0]) if autor else "", "licencas": lic, "licenca_url": lic_url,
            "arquivos": arqs, "descricao": re.sub(r"\s+", " ", desc).strip()}


def main():
    os.makedirs(DL, exist_ok=True)
    fichas = json.load(open(FICHAS)) if os.path.exists(FICHAS) else {}
    if sys.argv[1] == "fichas":
        for slug in SLUGS + sys.argv[2:]:
            f = ficha(slug)
            fichas[slug] = f
            print(slug, "|", f["autor"], "|", f["licencas"], "|", [a.rsplit("/", 1)[1] for a in f["arquivos"]])
        json.dump(fichas, open(FICHAS, "w"), indent=1, ensure_ascii=False)
    elif sys.argv[1] == "baixar":
        so = None
        args = sys.argv[2:]
        if args and args[0].startswith("--so="):
            so = set(args[0][5:].split(",")); args = args[1:]
        for slug in args:
            f = fichas[slug]
            if f["licencas"] != ["CC0"]:
                print("RECUSADO (licença não é só CC0):", slug, f["licencas"]); continue
            pasta = os.path.join(DL, slug)
            if os.path.exists(pasta) and os.listdir(pasta):
                print("já baixado:", slug); continue
            os.makedirs(pasta, exist_ok=True)
            for a in f["arquivos"]:
                if so and a.rsplit("/", 1)[1] not in so:
                    continue
                nome = re.sub(r"[^A-Za-z0-9._-]", "_", a.rsplit("/", 1)[1])
                subprocess.run(["curl", "-sS", "-L", "--max-time", "300", "--max-filesize", "150000000",
                                "-o", os.path.join(pasta, nome), a], check=False)
                print(slug, nome, os.path.getsize(os.path.join(pasta, nome)) if os.path.exists(os.path.join(pasta, nome)) else "falhou")


if __name__ == "__main__":
    main()
