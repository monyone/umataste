import BufferingStrategy from "../buffering/buffering-strategy";
import Decoder from "../decoder/decoder";
import Source from "../source/source";

export type PlayerOption = {
  source: Source,
  decoder: Decoder
  buffering: BufferingStrategy
  baseTimeSyncType: 'vide' | 'soun'
};