import { Box } from "./box";

export type Tfdt = {
  version: number,
  flags: number,
  base_media_decode_time: number
};

export const parseTfdt = (arraybuffer: ArrayBuffer, tfdt: Box): Tfdt => {
  const view = new DataView(arraybuffer, tfdt.begin, (tfdt.end - tfdt.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);

  if (version === 0) {
    const base_media_decode_time = view.getUint32(4);

    return {
      version,
      flags,
      base_media_decode_time,
    };
  } else {
    const base_media_decode_time = (view.getUint32(4) * (2 ** 32)) | view.getUint32(8);

    return {
      version,
      flags,
      base_media_decode_time
    };
  }
}