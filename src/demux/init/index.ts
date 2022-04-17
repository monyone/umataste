import { findBox } from "../box/box";
import { parseHdlr } from "../box/hdlr";
import { parseMdhd } from "../box/mdhd";
import { Codec, parseStsd } from "../box/stsd";
import { parseTkhd } from "../box/tkhd";

export type InitData = {
  track_id: number,
  timescale: number,
  duration: number,
  handler_type: string,
  name: string,
  codec: Codec
}

export const parseInitData = (arraybuffer: ArrayBuffer): InitData[] => {
  return findBox(['moov', 'trak'], arraybuffer).filter((trak) => {
    const tkhd = findBox(['tkhd'], arraybuffer, trak.begin, trak.end)[0];
    if (!tkhd) { return false; }
    const mdhd = findBox(['mdia', 'mdhd'], arraybuffer, trak.begin, trak.end)[0];
    if (!mdhd) { return false; }
    const hdlr = findBox(['mdia', 'hdlr'], arraybuffer, trak.begin, trak.end)[0];
    if (!hdlr) { return false; }
    const stsd = findBox(['mdia', 'minf', 'stbl', 'stsd'], arraybuffer, trak.begin, trak.end)[0];
    if (!stsd) { return false; }
    
    return true;
  }).map((trak) => {
    const tkhd = findBox(['tkhd'], arraybuffer, trak.begin, trak.end)[0];
    const mdhd = findBox(['mdia', 'mdhd'], arraybuffer, trak.begin, trak.end)[0];
    const hdlr = findBox(['mdia', 'hdlr'], arraybuffer, trak.begin, trak.end)[0];
    const stsd = findBox(['mdia', 'minf', 'stbl', 'stsd'], arraybuffer, trak.begin, trak.end)[0];

    const { track_id, duration } = parseTkhd(arraybuffer, tkhd);
    const { timescale } = parseMdhd(arraybuffer, mdhd);
    const { handler_type, name } = parseHdlr(arraybuffer, hdlr);
    const { codec } = parseStsd(arraybuffer, stsd);

    return {
      track_id,
      timescale,
      duration,
      handler_type,
      name,
      codec
    };
  })
};