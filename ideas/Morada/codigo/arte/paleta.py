"""Paleta única do Morada: 16×16 cores numa textura de 16×16 pixels.

Toda face de todo modelo aponta o UV para o centro de uma célula. Trocar uma cor aqui troca
em todos os personagens, sem refazer nenhum modelo.
"""

CORES = {
    # pele
    "pele_clara": "#F3CBA5", "pele_media": "#E6AE84", "pele_morena": "#CF9166", "pele_bebe": "#F2C19C",
    # cabelo e rosto
    "cabelo_castanho": "#5E3A24", "cabelo_escuro": "#3B2417", "cabelo_grisalho": "#BDB8B3",
    "barba_branca": "#DEDAD5", "olho": "#2A1A12", "branco": "#FFFFFF", "boca": "#7A2E2E",
    # roupas
    "creme": "#F0E4C8", "marrom": "#6E4B2F", "marrom_escuro": "#4A3220", "bege_boina": "#C9A27A",
    "roxo": "#8F6BB5", "azul_xadrez": "#3E66A8", "azul_marinho": "#2C3656", "branco_roupa": "#F5F5F2",
    "amarelo": "#F3C845", "bege_calca": "#DCCBAA", "verde": "#3F7E50", "rosa": "#F190B2",
    "jeans": "#5F7AB9", "jeans_claro": "#8FA3D1", "azul_claro": "#93C2EC", "azul_macacao": "#4068AF",
    "rosa_claro": "#F7B8CF", "caqui": "#C8A877", "azul_raglan": "#3F64B1",
    "azul_xadrez_escuro": "#2E4E8C", "verde_escuro": "#2F6640", "caqui_escuro": "#A98C5E",
    "rosa_escuro": "#D9718F", "amarelo_escuro": "#D9AC2C", "roxo_escuro": "#6F4F93",
    "blush": "#F3A3A0", "lingua": "#E0727A", "cabelo_castanho_claro": "#7A4D30",
    # acessórios e calçados
    "ouro": "#E3B34B", "armacao": "#2A2A2A", "sola": "#F7F7F7", "sandalia": "#B98759",
}

NOMES = list(CORES)
assert len(NOMES) <= 256, "a paleta tem 256 células"


def indice(nome: str) -> int:
    return NOMES.index(nome)


def uv(nome: str):
    i = indice(nome)
    # V invertido: a linha 0 da imagem fica em cima no glTF
    return ((i % 16 + 0.5) / 16, 1 - (i // 16 + 0.5) / 16)


def rgba(nome: str):
    h = CORES[nome].lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def gerar_imagem(bpy, caminho: str):
    """Cria a textura 16×16 da paleta e salva em PNG."""
    img = bpy.data.images.new("paleta", 16, 16, alpha=False)
    px = [0.0] * (16 * 16 * 4)
    for i, nome in enumerate(NOMES):
        x, y = i % 16, 15 - i // 16  # Blender guarda as linhas de baixo para cima
        r, g, b, a = rgba(nome)
        o = (y * 16 + x) * 4
        px[o:o + 4] = [r, g, b, a]
    img.pixels = px
    img.filepath_raw = caminho
    img.file_format = "PNG"
    img.save()
    return img
