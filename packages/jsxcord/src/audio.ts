import type { TransformCallback, TransformOptions } from 'node:stream'
import { Buffer } from 'node:buffer'
import { Readable, Transform } from 'node:stream'
import { createAudioResource, StreamType } from '@discordjs/voice'
import FFmpeg from './ffmpeg.js'

/** How long in milliseconds to wait between sending stream data */
const MS_PER_SEND = 20

/** Opaque type, used to play/pause/remove a track once created */
export type TrackHandle = number

/**
 * Allows multiple tracks to be played at once,
 * with the ability to dynamically add tracks even
 * as others are playing
 */
export class Mixer extends Readable {
  private tracks: Record<TrackHandle, Readable> = {}
  private endListeners: Record<TrackHandle, (() => void | Promise<void>)[]> = {}

  // Fixed number of streams that get merged
  // Tracks added to the mixer get allocated to a stream
  private streams: {
    mixerStream: MixerStream
    allocation: TrackHandle | null
  }[] = []

  private time = performance.now()

  /**
   * Reads from the final mixer stream,
   * which is a combination of all individual streams
   */
  _read() {
    // Figure out how long to wait to send
    const elapsed = performance.now() - this.time
    this.time = performance.now()
    const timeTilNextSend = MS_PER_SEND - elapsed

    const sendBytes = async () => {
      // Multiply by 48 * 2 * 2 because 48Khz with 2 bytes per sample and 2 channels
      const bytesToRead = MS_PER_SEND * 48 * 2 * 2

      const results: Buffer[] = []

      // Read the streams
      for (const stream of this.streams) {
        const result = stream.mixerStream.read(bytesToRead) as Buffer | null
        if (result) {
          results.push(result)
        }
      }

      if (results.length === 0) {
        this.push(Buffer.from([0, 0]))
        return
      }

      // Merge the streams
      const mergedResult = Buffer.alloc(bytesToRead)
      for (let i = 0; i < bytesToRead / 2; i++) {
        const values = results.map(buf => buf.readInt16LE(i * 2))
        mergedResult.writeInt16LE(
          Math.max(Math.min(values.reduce((a, b) => a + b, 0), 32767), -32768),
          i * 2,
        )
      }

      this.push(mergedResult)
    }

    // Send when ready
    timeTilNextSend > 0
      ? setTimeout(() => void sendBytes(), timeTilNextSend)
      : void sendBytes()
  }

  constructor(streamCount = 1) {
    super()

    for (let i = 0; i < streamCount; i++) {
      this.streams.push({
        mixerStream: new MixerStream(),
        allocation: null,
      })
    }
  }

  /** Gets the mixer's `AudioResource` */
  getAudioResource() {
    const resource = createAudioResource(this, { inputType: StreamType.Raw })
    return resource
  }

  /** Plays a track */
  playTrack(stream: Readable, startPaused?: boolean): TrackHandle {
    const handle = Math.random()

    // Store the stream
    this.tracks[handle] = stream

    // Find stream with no allocation
    let unallocatedStream = this.streams.find(s => s.allocation === null)
    if (unallocatedStream === undefined) {
      unallocatedStream = {
        mixerStream: new MixerStream(),
        allocation: null,
      }
      this.streams.push(unallocatedStream)
    }

    unallocatedStream.allocation = handle
    unallocatedStream.mixerStream.play(stream)
    if (startPaused) {
      unallocatedStream.mixerStream.pauseStream()
    }

    // Remove allocation once stream has ended
    // This is done by counting the total number of samples in the stream
    // and then delaying by the correct around

    let streamLength = 0
    stream.on('data', (chunk: Buffer) => {
      streamLength += chunk.length
    })

    const startTime = Date.now()

    stream.once('end', () => {
      const totalMs = streamLength / 48 / 2 / 2
      const msToWait = totalMs - (Date.now() - startTime)

      if (msToWait <= 0) {
        if (unallocatedStream.allocation === handle) {
          this.stopTrack(handle)
        }
      }
      else {
        setTimeout(() => {
          if (unallocatedStream.allocation === handle) {
            this.stopTrack(handle)
          }
        }, msToWait)
      }
    })

    return handle
  }

  onTrackEnd(handle: TrackHandle, func: () => void | Promise<void>) {
    this.endListeners[handle] = [
      ...(this.endListeners[handle] ?? []),
      func,
    ]
  }

  offTrackEnd(handle: TrackHandle, func: () => void | Promise<void>) {
    if (!this.endListeners[handle]) {
      return
    }

    this.endListeners[handle] = this.endListeners[handle].filter(
      listener => listener !== func,
    )

    if (this.endListeners[handle].length === 0) {
      delete this.endListeners[handle]
    }
  }

  private getStreamFromHandle(handle: TrackHandle) {
    const result = this.streams.find(s => s.allocation === handle)
    return result?.mixerStream
  }

  private removeAllocation(handle: TrackHandle) {
    const result = this.streams.find(s => s.allocation === handle)
    if (result !== undefined) {
      result.allocation = null
    }
  }

  /** Pauses a track */
  pauseTrack(handle: TrackHandle) {
    this.getStreamFromHandle(handle)?.pauseStream()
  }

  /** Stops a track */
  stopTrack(handle: TrackHandle) {
    if (this.endListeners[handle]) {
      for (const handler of this.endListeners[handle]) {
        // console.log('ended', handle)
        handler()
      }
    }

    this.getStreamFromHandle(handle)?.pauseStream()
    this.removeAllocation(handle)
  }

  /** Resumes a track */
  resumeTrack(handle: TrackHandle) {
    this.getStreamFromHandle(handle)?.resumeStream()
  }

  /** Changes an existing track to something else */
  changeTrack(handle: TrackHandle, readable: Readable) {
    this.getStreamFromHandle(handle)?.play(readable)
  }

  /** Sets the track volume */
  setTrackVolume(handle: TrackHandle, volume: number) {
    const stream = this.getStreamFromHandle(handle)
    if (stream !== undefined) {
      stream.volume = volume
    }
  }
}

class DataWaitPassThroughStream extends Transform {
  dataIsReady: boolean = false

  constructor(opts?: TransformOptions) {
    super(opts)
  }

  _transform(chunk: any, _encoding: BufferEncoding, callback: TransformCallback) {
    if (!this.dataIsReady) {
      this.dataIsReady = true
      this.emit('ready')
    }
    callback(null, chunk)
  }
}

/** An individual stream in a `Mixer`, which supports pausing */
class MixerStream extends Readable {
  private time = performance.now()
  private stream: Readable | null = null
  private isStreamPaused = false

  /** The stream's volume */
  public volume = 1

  private bitrate = 48000
  private channels = 2
  private bytesPerChannel = 2

  constructor(options?: { bitrate: number, channels: number, bytesPerChannel: number }) {
    super()

    if (options) {
      this.bitrate = options.bitrate
      this.channels = options.channels
      this.bytesPerChannel = options.bytesPerChannel
    }
  }

  /**
   * Reads from the stream,
   * which outputs silence if nothing is playing
   */
  _read() {
    const elapsed = performance.now() - this.time
    this.time = performance.now()
    const timeTilNextSend = MS_PER_SEND - elapsed

    const sendBytes = async () => {
      const bytesToSend = MS_PER_SEND * this.bitrate / 1000 * this.channels * this.bytesPerChannel

      if (this.stream === null || this.isStreamPaused) {
        this.push(Buffer.from([0, 0]))
        return
      }

      let data = this.stream.read(bytesToSend)
      if (data === null) {
        this.push(Buffer.from([0, 0]))
        return
      }

      if (data.length < bytesToSend) {
        const padded = Buffer.alloc(bytesToSend)
        data.copy(padded)
        data = padded
      }

      const dataWithVolume = Buffer.alloc(data.length)

      for (let i = 0; i < data.length / 2; i++) {
        dataWithVolume.writeInt16LE(
          data.readInt16LE(i * 2) * this.volume,
          i * 2,
        )
      }

      this.push(dataWithVolume)
    }

    timeTilNextSend > 0
      ? setTimeout(() => void sendBytes(), timeTilNextSend)
      : void sendBytes()
  }

  /** Plays a new stream */
  play(stream: Readable) {
    this.stream = stream.pipe(new DataWaitPassThroughStream())
    this.isStreamPaused = false
  }

  /** Pauses the current stream */
  pauseStream() {
    this.isStreamPaused = true
  }

  /** Resumes the current stream */
  resumeStream() {
    this.isStreamPaused = false
  }
}

function bunStreamToNodeJsSteam(stream: ReadableStream) {
  const nodeStream = new Transform()

  stream.pipeTo(new WritableStream({
    write(value) {
      nodeStream.push(value)
    },

    close() {
      nodeStream.push(null)
    },
  }))

  return nodeStream
}

let totalFfmpegInstances = 0

/** Converts a file path or stream to a PCM stream */
export function streamResource(
  resource: string | Buffer | Readable | ReadableStream | NodeJS.ReadableStream,
  ffmpegOptions?: { inputArgs?: string },
): Readable {
  totalFfmpegInstances += 1
  if (totalFfmpegInstances > 20) {
    throw new Error('TOO MANY FFMPEG!!!')
  }

  /**
   * Quite a lot going on here! Let's explain all of it here.
   *
   * The purpose of this ffmpeg command is to output audio as a real-time stream,
   * so we can manipulate in real-time.
   *
   * Flags:
   *
   * -re: feed input in in real-time
   *
   * -i: input the resource from `fpOrStream`
   *
   * -ar 48k -ac 2: 48k bitrate, 2 channels
   *
   * -af apad=pad_dur=5: adds 5 seconds of silence to the end to prevent cutoff
   *
   * -f s16le: converts to raw samples so we can add them and stuff
   *
   * -rtbufsize 1 -blocksize 1 -flush_packets 1: outputs in real-time,
   *    so the process doesn't end before all the audio has played
   */
  const ffmpeg = new FFmpeg({
    args: `-fflags nobuffer -probesize 32 -analyzeduration 0 ${ffmpegOptions?.inputArgs ? `${ffmpegOptions.inputArgs} ` : ''}-i ${typeof resource === 'string' ? resource : 'pipe:'} -ar 48k -ac 2 -af apad=pad_dur=2 -flush_packets 1 -f s16le`.split(' '),
    source: 'ffmpeg',
  })

  ffmpeg.once('finish', () => {
    totalFfmpegInstances -= 1
  })

  if (typeof resource !== 'string') {
    if (Buffer.isBuffer(resource)) {
      Readable.from(resource).pipe(ffmpeg)
    }
    else if (resource instanceof ReadableStream) {
      bunStreamToNodeJsSteam(resource).pipe(ffmpeg)
    }
    else {
      resource.pipe(ffmpeg)
    }
  }

  // // eslint-disable-next-line no-console
  // ffmpeg.process.stderr?.on('data', data => console.log(data.toString()))

  return ffmpeg
}
