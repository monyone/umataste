# umtaste [![npm](https://img.shields.io/npm/v/umataste.svg?style=flat)](https://www.npmjs.com/package/umataste)

HTML5 fmp4 live stream (ll-fmp4) player written in TypeScript

## Feature

* Playback for fmp4 stream
* Extremely low latency of less than 0.1 second in the best case
* following live playback style supported
    * MSE (High Quolity, but 0.5 ~ delay)
    * Breakout Box (low latency, use WebCodecs and BreakOut Box, Chrome Only)
    * Canvas + WebAudio (low latency, use WebCodecs, Chrome Only)
* Every component are plugable style

## Build

```
yarn
yarn build
```

## Getting Started

```
<script src="umataste url or import"></script>
<video id="videoElement"></video>
<script>
  var videoElement = document.getElementById('videoElement');
  // MSEPlayer use Media Source Extension
  // BreakoutBoxPlayer use Insertable Stream for MediaStreamTrack
  // CanvasWebAudioPlayer use Canvas and WebAudio
  var zlplayer = new window.umataste.MSEPlayer({ 
    // some options
  });
  zlplayer.attachMedia(videoElement);
  zlplayer.load(/* url */).then(() => {
    videoElement.play()
  });
</script>
```
