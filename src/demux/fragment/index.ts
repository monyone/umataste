import { findBox } from "../box/box";
import { parseTfdt } from "../box/tfdt";
import { parseTfhd } from "../box/tfhd";
import { parseTrun } from "../box/trun";
import { InitData } from "../init/index";

export const getFragmentData = (arraybuffer: ArrayBuffer, initData: InitData[]) => {
  return findBox('moof', arraybuffer).map((moof) => {
    return findBox('traf', arraybuffer, moof.begin, moof.end).filter((traf) => {
      const tfdt = findBox('tfdt', arraybuffer, traf.begin, traf.end)[0];
      if (!tfdt) { return false; }
      const tfhd = findBox('tfhd', arraybuffer, traf.begin, traf.end)[0];
      if (!tfhd) { return false; }
      const trun = findBox('trun', arraybuffer, traf.begin, traf.end)[0];
      if (!trun) { return false; }

      const { track_id } = parseTfhd(arraybuffer, tfhd);
      const track = initData.find(track => track.track_id === track_id);
      if (!track) { return false; }

      return true;
    }).map((traf) => {
      const tfdt = findBox('tfdt', arraybuffer, traf.begin, traf.end)[0];
      const tfhd = findBox('tfhd', arraybuffer, traf.begin, traf.end)[0];
      const trun = findBox('trun', arraybuffer, traf.begin, traf.end)[0];
  
      const { track_id, default_sample_duration } = parseTfhd(arraybuffer, tfhd);
      const track = initData.find(track => track.track_id === track_id)!;

      const sample_duration = default_sample_duration ?? track.duration;
      const { base_media_decode_time } = parseTfdt(arraybuffer, tfdt);
      const { sample_count, data_offset } = parseTrun(arraybuffer, trun);
  
      return {
        base_media_decode_time:  (base_media_decode_time / track.timescale),
        sample_duration: sample_duration / track.timescale,
        duration: (sample_duration * sample_count / track.timescale),
        track: track,
        data_offset: data_offset
      }
    });
  });
}

export const getBaseTime = (arraybuffer: ArrayBuffer, initData: InitData[]) => {
  const offsets: number[] = [];

  const moof = findBox('moof', arraybuffer)[0];
  if (!moof) { return []; }

  return findBox('traf', arraybuffer, moof.begin, moof.end).filter((traf) => {
    const tfdt = findBox('tfdt', arraybuffer, traf.begin, traf.end)[0];
    if (!tfdt) { return false; }
    const tfhd = findBox('tfhd', arraybuffer, traf.begin, traf.end)[0];
    if (!tfhd) { return false; }

    const { track_id } = parseTfhd(arraybuffer, tfhd);
    const track = initData.find(track => track.track_id === track_id);
    if (!track) { return false; }

    return true;
  }).map((traf) => {
    const tfdt = findBox('tfdt', arraybuffer, traf.begin, traf.end)[0];
    const tfhd = findBox('tfhd', arraybuffer, traf.begin, traf.end)[0];

    const { track_id } = parseTfhd(arraybuffer, tfhd);
    const track = initData.find(track => track.track_id === track_id)!;

    const { base_media_decode_time } = parseTfdt(arraybuffer, tfdt);

    return {
      base_media_decode_time:  (base_media_decode_time / track.timescale),
      track_id: track_id
    }
  });
}

export const adjustBaseTime = (arraybuffer: ArrayBuffer, initData: InitData[], baseTime: number): void => {
  findBox('moof', arraybuffer).forEach((moof) => {
    findBox('traf', arraybuffer, moof.begin, moof.end).forEach((traf) => {
      const tfdt = findBox('tfdt', arraybuffer, traf.begin, traf.end)[0];
      if (!tfdt) { return; }

      const tfhd = findBox('tfhd', arraybuffer, traf.begin, traf.end)[0];
      if (!tfdt) { return; }

      const { track_id } = parseTfhd(arraybuffer, tfhd);
      const track = initData.find(track => track.track_id === track_id)!;

      let { version, base_media_decode_time } = parseTfdt(arraybuffer, tfdt);
      base_media_decode_time -= baseTime * track.timescale;

      const view = new DataView(arraybuffer, tfdt.begin, (tfdt.end - tfdt.begin));
      if (version === 0) { 
        view.setUint32(4, base_media_decode_time, false);
      } else if (version === 1) {
        view.setUint32(4, base_media_decode_time / (2 ** 32), false);
        view.setUint32(8, base_media_decode_time % (2 ** 32), false);
      }
    });
  });
}