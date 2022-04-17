import { Box } from "./box";

export type Tkhd = {
  version: number,
  flags: number,
  track_id: number
  duration: number
};

export const parseTkhd = (arraybuffer: ArrayBuffer, tkhd: Box): Tkhd => {
  const view = new DataView(arraybuffer, tkhd.begin, (tkhd.end - tkhd.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  
  if (version === 0) {
    const track_id = view.getUint32(12, false);
    const duration = view.getUint32(20, false);

    return {
      version,
      flags,
      track_id,
      duration
    };
  } else {
    const track_id = view.getUint32(20, false);
    const duration = (view.getUint32(28, false) * (2 ** 32)) | view.getUint32(32, false);

    return {
      version,
      flags,
      track_id,
      duration
    };
  }
}