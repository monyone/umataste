export class BitStream {
  private bits: number[];
  private data: Uint8Array;
  private offset: number;

  public constructor(data: ArrayBuffer) {
    this.bits = [];
    this.data = new Uint8Array(data);
    this.offset = 0;
  }

  public empty(): boolean {
    return this.offset >= this.data.length && this.bits.length === 0;
  }

  public bitLength(): number {
    return this.bits.length + (this.data.length - this.offset) * 8;
  }

  private fill(): void {
    if (this.offset >= this.data.length) { return; }
    this.bits.push((this.data[this.offset] & 0b10000000) >> 7);
    this.bits.push((this.data[this.offset] & 0b01000000) >> 6);
    this.bits.push((this.data[this.offset] & 0b00100000) >> 5);
    this.bits.push((this.data[this.offset] & 0b00010000) >> 4);
    this.bits.push((this.data[this.offset] & 0b00001000) >> 3);
    this.bits.push((this.data[this.offset] & 0b00000100) >> 2);
    this.bits.push((this.data[this.offset] & 0b00000010) >> 1);
    this.bits.push((this.data[this.offset] & 0b00000001) >> 0);
    this.offset += 1;
  }

  private peek(): number {
    if (this.empty()) { return 0; }
    if (this.bits.length === 0) { this.fill(); }
    return this.bits.shift() ?? 0
  }

  public skipBits(length: number): void {
    while (length > 0) {
      this.peek();
      length -= 1;
    }
  }

  public readBits(length: number): number {
    let bits = 0;
    while (length > 0) {
      bits *= 2;
      bits += this.peek();
      length -= 1;
    }
    return bits;
  }

  public readBool() {
    return this.readBits(1) === 1;
  }
}