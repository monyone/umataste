import { InitData } from "../demux/init/index";

export const EventTypes = {
  INIT_SEGMENT_RECIEVED: 'INIT_SEGMENT_RECIEVED',
  FRAGMENT_RECIEVED: 'FRAGMENT_RECIEVED',

  H264_PARSED: 'H264_PARSED',
  AAC_PARSED: 'AAC_PARSED',

  H264_EMITTED: 'H264_EMITTED',
  AAC_EMITTED: 'AAC_EMITTED',

  VIDEO_FRAME_DECODED: 'VIDEO_FRAME_DECODED',
  AUDIO_FRAME_DECODED: 'AUDIO_FRAME_DECODED',

  VIDEO_DECODE_ERROR: 'VIDEO_DECODE_ERROR',
  AUDIO_DECODE_ERROR: 'AUDIO_DECODE_ERROR',
} as const;

export type INIT_SEGMENT_RECIEVED_PAYLOAD = {
  event: typeof EventTypes.INIT_SEGMENT_RECIEVED;
  adaptation_id: number,
  init: ArrayBuffer
}

export type FRAGMENT_RECIEVED_PAYLOAD = {
  event: typeof EventTypes.FRAGMENT_RECIEVED;
  adaptation_id: number,
  sidx: ArrayBuffer[],
  fragment: ArrayBuffer
}

export type H264_PARSED_PAYLOAD = {
  event: typeof EventTypes.H264_PARSED,
  timestamp: number,
  isIDR: boolean
  payload: ArrayBuffer
}

export type AAC_PARSED_PAYLOAD = {
  event: typeof EventTypes.AAC_PARSED,
  timestamp: number,
  duration: number,
  payload: ArrayBuffer
}

export type H264_EMITTED_PAYLOAD = {
  event: typeof EventTypes.H264_EMITTED,
  timestamp: number,
  isIDR: boolean
  payload: ArrayBuffer
}

export type AAC_EMITTED_PAYLOAD = {
  event: typeof EventTypes.AAC_EMITTED,
  timestamp: number,
  duration: number,
  payload: ArrayBuffer
}

export type VIDEO_FRAME_DECODED_PAYLOAD = {
  event: typeof EventTypes.VIDEO_FRAME_DECODED;
  frame: VideoFrame;
}

export type AUDIO_FRAME_DECODED_PAYLOAD = {
  event: typeof EventTypes.AUDIO_FRAME_DECODED;
  frame: AudioData;
}

export type VIDEO_DECODE_ERROR_PAYLOAD = {
  event: typeof EventTypes.VIDEO_DECODE_ERROR;
  error: unknown;
}

export type AUDIO_DECODE_ERROR_PAYLOAD = {
  event: typeof EventTypes.AUDIO_DECODE_ERROR;
  error: unknown;
}

export type Events = {
  [EventTypes.INIT_SEGMENT_RECIEVED]: INIT_SEGMENT_RECIEVED_PAYLOAD,
  [EventTypes.FRAGMENT_RECIEVED]: FRAGMENT_RECIEVED_PAYLOAD,

  [EventTypes.H264_PARSED]: H264_PARSED_PAYLOAD,
  [EventTypes.AAC_PARSED]: AAC_PARSED_PAYLOAD,

  [EventTypes.H264_EMITTED]: H264_EMITTED_PAYLOAD,
  [EventTypes.AAC_EMITTED]: AAC_EMITTED_PAYLOAD,

  [EventTypes.VIDEO_FRAME_DECODED]: VIDEO_FRAME_DECODED_PAYLOAD,
  [EventTypes.AUDIO_FRAME_DECODED]: AUDIO_FRAME_DECODED_PAYLOAD,

  [EventTypes.VIDEO_DECODE_ERROR]: VIDEO_DECODE_ERROR_PAYLOAD,
  [EventTypes.AUDIO_DECODE_ERROR]: AUDIO_DECODE_ERROR_PAYLOAD,
}