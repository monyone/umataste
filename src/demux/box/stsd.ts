import { BitStream } from "../../util/bitstream";
import { Box, findBox } from "./box";

export type AVCCodec = {
  name: 'avc1'
  identifier: string,
  description: ArrayBuffer,
  avcC: {
    configuration_version: number,
    avc_profile_indication: number,
    profile_compatibility: number,
    avc_level_indication: number,
    nalu_length_size: number
  }
};

export type HEVCCodec = {
  name: 'hvc1'
  identifier: string,
  description: ArrayBuffer,
  hvcC: {
  }
};

export type MP4ACodec = {
  name: 'mp4a',
  identifier: string,
  description: ArrayBuffer
  sampling_frequency: number,
  mp4a: {
    object_type: number,
    sampling_frequency: number,
  }
};
const samplingFrequencyIndexMap = new Map<number, number>([
  [0x00, 96000],
  [0x01, 88200],
  [0x02, 64000],
  [0x03, 48000],
  [0x04, 44100],
  [0x05, 32000],
  [0x06, 24000],
  [0x07, 22050],
  [0x08, 16000],
  [0x09, 12000],
  [0x0a, 11025],
  [0x0b, 8000],
  [0x0c, 7350],
]);

export type Codec = AVCCodec | HEVCCodec | MP4ACodec | {
  name: string,
  identifier: string,
  description: ArrayBuffer
};

export type Stsd = {
  version: number,
  flags: number,
  codec: Codec
};

const findDescriptor = (target: number, arraybuffer: ArrayBuffer, begin: number = 0, end?: number) => {
  if (end == null) { end = arraybuffer.byteLength; }
  const view = new DataView(arraybuffer, begin, (end - begin));

  const result = [];
  while (begin < end) {
    const tag = view.getUint8(0);
    let size = 0, index = 0;
    while (true) {
      const value = view.getUint8(++index);
      size = (size << 7) | (value & 0x7F);
      if ((value & 0x80) === 0) { break; }
    }

    if (target === tag) {
      result.push({
        tag,
        begin: begin + 1 + index,
        end: begin + 1 + index + size,
      });
    }

    begin += (index + size);
  }

  return result;
}

export const parseStsd = (arraybuffer: ArrayBuffer, stsd: Box): Stsd => {
  const view = new DataView(arraybuffer, stsd.begin, (stsd.end - stsd.begin));
  const version = view.getUint8(0);
  const flags = (view.getUint8(1) << 16) | (view.getUint8(2) << 8) | view.getUint8(3);
  const entry: Codec[] = findBox(null, arraybuffer, stsd.begin + 8, stsd.end).map((box) => {
    if (box.type === 'avc1') {
      const avcC = findBox('avcC', arraybuffer, box.begin + 8 + 70, box.end)[0];
      if (!avcC) {
        return {
          name: box.type,
          identifier: box.type,
          description: new ArrayBuffer(0)
        };
      }
      const view = new DataView(arraybuffer, avcC.begin, (avcC.end - avcC.begin));
      const configuration_version = view.getUint8(0);
      const avc_profile_indication = view.getUint8(1);
      const profile_compatibility = view.getUint8(2);
      const avc_level_indication = view.getUint8(3);
      const nalu_length_size = (view.getUint8(4) & 3) + 1;

      return {
        name: box.type,
        identifier: `${box.type}.${avc_profile_indication.toString(16).padStart(2, '0')}${profile_compatibility.toString(16).padStart(2, '0')}${avc_level_indication.toString(16).padStart(2, '0')}`,
        description: arraybuffer.slice(avcC.begin, avcC.end),
        avcC: {
          configuration_version,
          avc_profile_indication,
          profile_compatibility,
          avc_level_indication,
          nalu_length_size
        }
      };
    } else if (box.type === 'hvc1') {
      const hvcC = findBox('hvcC', arraybuffer, box.begin + 8 + 70, box.end)[0];
      if (!hvcC) {
        return {
          name: box.type,
          identifier: box.type,
          description: new ArrayBuffer(0)
        };
      }
      const view = new DataView(arraybuffer, hvcC.begin, (hvcC.end - hvcC.begin));
      const general_profile_idc = (view.getUint8(1) & 0x1F) >> 0;
      const general_level_idc = view.getUint8(12)

      return {
        name: box.type,
        identifier: `${box.type}.${general_profile_idc}.1.L${general_level_idc}.B0`,
        description: arraybuffer.slice(hvcC.begin, hvcC.end),
        hvcC: {}
      };
    } else if (box.type === 'mp4a') {
      const esds = findBox('esds', arraybuffer, box.begin + 8 + 20, box.end)[0];
      const es_descriptor = findDescriptor(0x03, arraybuffer, esds.begin + 4, esds.end)[0];
      if (!es_descriptor) {
        return {
          name: box.type,
          identifier: box.type,
          description: new ArrayBuffer(0)
        };
      }

      const decoder_config = findDescriptor(0x04, arraybuffer, es_descriptor.begin + 3, es_descriptor.end)[0];
      if (!decoder_config) {
        return {
          name: box.type,
          identifier: box.type,
          description: new ArrayBuffer(0)
        };
      }
      const decoder_config_view = new DataView(arraybuffer, decoder_config.begin, decoder_config.end - decoder_config.begin);
      const object_type_indication = decoder_config_view.getUint8(0);

      const decoder_specific_info = findDescriptor(0x05, arraybuffer, decoder_config.begin + 13, decoder_config.end)[0];
      if (!decoder_specific_info) {
        return {
          name: box.type,
          identifier: box.type,
          description: new ArrayBuffer(0)
        };
      }
      const description = arraybuffer.slice(decoder_specific_info.begin, decoder_specific_info.end);

      const stream = new BitStream(description);
      let objectType = stream.readBits(5);
      if (objectType === 31) { objectType = 32 + stream.readBits(6); }
      const samplingFrequencyIndex = stream.readBits(4);
      if (samplingFrequencyIndex === 0x0F) {
        const samplingFrequency = stream.readBits(24);
        const channelConfiguration = stream.readBits(4);

        return {
          name: box.type,
          identifier: `${box.type}.${object_type_indication.toString(16).padStart(2)}.${objectType}`,
          description,
          mp4a: {
            object_type: objectType,
            sampling_frequency: samplingFrequency,
            channel_configuration: channelConfiguration
          }
        };
      } else {
        const channelConfiguration = stream.readBits(4);

        return {
          name: box.type,
          identifier: `${box.type}.${object_type_indication.toString(16).padStart(2)}.${objectType}`,
          description,
          mp4a: {
            object_type: objectType,
            sampling_frequency: samplingFrequencyIndexMap.get(samplingFrequencyIndex),
            channel_configuration: channelConfiguration
          }
        };
      }
    } else {
      return {
        name: box.type,
        identifier: box.type,
        description: new ArrayBuffer(0)
      };
    }
  });

  return {
    version,
    flags,
    codec: entry[0]
  };
}