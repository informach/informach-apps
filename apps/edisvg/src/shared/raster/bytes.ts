/** Growable byte sink shared by the GIF, MP4 and WebM writers. It refuses to grow past a
 * caller limit instead of letting a large export exhaust the renderer's memory. */
export class ByteWriter {
  #buffer: Uint8Array;
  #length = 0;
  constructor(
    readonly limit: number,
    initial = 64 * 1024,
  ) {
    this.#buffer = new Uint8Array(Math.min(initial, limit));
  }
  get length() {
    return this.#length;
  }
  #reserve(size: number) {
    const needed = this.#length + size;
    if (needed > this.limit) throw new Error("Exportação excede o limite de tamanho do arquivo.");
    if (needed <= this.#buffer.length) return;
    let capacity = this.#buffer.length || 1024;
    while (capacity < needed) capacity *= 2;
    const next = new Uint8Array(Math.min(capacity, this.limit));
    next.set(this.#buffer.subarray(0, this.#length));
    this.#buffer = next;
  }
  byte(value: number) {
    this.#reserve(1);
    this.#buffer[this.#length++] = value & 0xff;
  }
  bytes(values: ArrayLike<number>) {
    this.#reserve(values.length);
    this.#buffer.set(values, this.#length);
    this.#length += values.length;
  }
  u16le(value: number) {
    this.byte(value);
    this.byte(value >>> 8);
  }
  u16be(value: number) {
    this.byte(value >>> 8);
    this.byte(value);
  }
  u32be(value: number) {
    this.u16be(value >>> 16);
    this.u16be(value);
  }
  ascii(text: string) {
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code > 0x7f) throw new Error("Texto binário deve ser ASCII.");
      this.byte(code);
    }
  }
  /** Overwrites four bytes already written (box sizes known only after their content). */
  patchU32be(offset: number, value: number) {
    if (offset < 0 || offset + 4 > this.#length) throw new Error("Posição binária inválida.");
    this.#buffer[offset] = value >>> 24;
    this.#buffer[offset + 1] = value >>> 16;
    this.#buffer[offset + 2] = value >>> 8;
    this.#buffer[offset + 3] = value;
  }
  finish() {
    return this.#buffer.slice(0, this.#length);
  }
}
