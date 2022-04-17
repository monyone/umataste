import { Box } from "./box";

type Entry = {
  sample_duration?: number,
  sample_size?: number,
  sample_flags?: number,
  sample_composition_time_offset?: number;
}

export type Trun = {
  version: number,
  flags: number,
  sample_count: number,
  data_offset?: number,
  first_sample_flag?: number;
  entries: Entry[];
};

export const parseTrun = (arraybuffer: ArrayBuffer, trun: Box): Trun => {
  const view = new DataView(arraybuffer, trun.begin, (trun.end - trun.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  const sample_count = view.getUint32(4, false);

  let index = 8;
  const result: Partial<Trun> = {};
  if ((flags & 0x000001) !== 0) {
    result.data_offset = view.getInt32(index, false);
    index += 4;
  }
  if ((flags & 0x000004) !== 0) {
    result.first_sample_flag = view.getUint32(index, false);
    index += 4;
  }

  const entries: Entry[] = [];
  while (index < (trun.end - trun.begin)) {
    const entry: Partial<Entry> = {};
    if ((flags & 0x000100) !== 0) {
      entry.sample_duration = view.getUint32(index, false);
      index += 4;
    }
    if ((flags & 0x000200) !== 0) {
      entry.sample_size = view.getUint32(index, false);
      index += 4;
    }
    if ((flags & 0x000400) !== 0) {
      entry.sample_flags = view.getUint32(index, false);
      index += 4;
    }
    if ((flags & 0x000800) !== 0) {
      if (version === 0) {
        entry.sample_composition_time_offset = view.getUint32(index, false);
      } else {
        entry.sample_composition_time_offset = view.getInt32(index, false);
      }
      index += 4;
    }
    entries.push(entry);
  }

  return {
    version,
    flags,
    sample_count,
    ... result,
    entries
  };
}