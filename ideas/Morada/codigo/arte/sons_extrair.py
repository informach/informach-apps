"""Extrai só os arquivos de áudio de um zip/7z baixado, com nomes saneados, numa pasta nova e vazia.
Uso: python -I sons_extrair.py arquivo.zip pasta_destino
Não executa nada do pacote; recusa caminhos absolutos, '..' e arquivos que não sejam de áudio.
"""
import os, re, sys, zipfile

AUDIO = (".wav", ".ogg", ".mp3", ".flac", ".txt", ".md")
LIMITE = 200 * 1024 * 1024


def nome_seguro(n):
    partes = [p for p in n.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    return "__".join(re.sub(r"[^A-Za-z0-9._-]", "_", p) for p in partes)


def main():
    arq, dest = sys.argv[1], sys.argv[2]
    os.makedirs(dest, exist_ok=False)
    total = 0
    if arq.endswith(".7z"):
        import py7zr
        import tempfile, shutil
        with py7zr.SevenZipFile(arq, "r") as z:
            infos = z.list()
            if sum(i.uncompressed for i in infos) > LIMITE: raise SystemExit("grande demais")
            nomes = [i.filename for i in infos if i.filename.lower().endswith(AUDIO)]
            if any(n.startswith("/") or ".." in n.replace("\\", "/").split("/") for n in nomes): raise SystemExit("caminho suspeito")
            tmp = tempfile.mkdtemp(dir="/dev/shm/morada_sons")
            z.extract(path=tmp, targets=nomes)
        for n in nomes:
            src = os.path.join(tmp, n)
            if os.path.isfile(src) and not os.path.islink(src):
                shutil.copyfile(src, os.path.join(dest, nome_seguro(n))); print(nome_seguro(n))
        shutil.rmtree(tmp)
        return
    with zipfile.ZipFile(arq) as z:
        for i in z.infolist():
            if i.is_dir() or not i.filename.lower().endswith(AUDIO) or "__MACOSX" in i.filename:
                continue
            total += i.file_size
            if total > LIMITE: raise SystemExit("grande demais")
            with z.open(i) as f:
                open(os.path.join(dest, nome_seguro(i.filename)), "wb").write(f.read())
            print(nome_seguro(i.filename), i.file_size)


if __name__ == "__main__":
    main()
