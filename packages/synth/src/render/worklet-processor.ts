export const MAX_WORKLET_FRAMES = 2048

export type WorkletParamDescriptor = {
  name: string
  defaultValue: number
  automationRate: string
}

export function wasmProcessorBody(descriptors: ReadonlyArray<WorkletParamDescriptor>): string {
  return `
const PARAM_DESCRIPTORS = ${JSON.stringify(descriptors)};
const MAX_FRAMES = ${MAX_WORKLET_FRAMES};
function clearOutput(output, frames) {
  if (!output || !output[0]) return;
  for (var c = 0; c < output.length; c++) {
    var channel = output[c];
    if (!channel) continue;
    for (var i = 0; i < frames; i++) channel[i] = 0;
  }
}
function decodeBase64(value) {
  var BufferCtor = globalThis.Buffer;
  if (BufferCtor && typeof BufferCtor.from === 'function') {
    var bytes = BufferCtor.from(value, 'base64');
    var out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out.buffer;
  }
  if (typeof atob !== 'function') throw new Error('WASM bytes missing and base64 decoder is unavailable');
  var binary = atob(value);
  var decoded = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
  return decoded.buffer;
}
function wasmBytesFromOptions(processorOptions) {
  var bytes = processorOptions.wasmBytes;
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes && bytes.buffer instanceof ArrayBuffer) {
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return decodeBase64(processorOptions.wasmBase64 || '');
}
class StopcockSynthProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return PARAM_DESCRIPTORS; }
  constructor(options) {
    super();
    options = options || {};
    var processorOptions = options.processorOptions || {};
    this.paramNames = processorOptions.wasmParamNames || [];
    this.inputChannels = processorOptions.wasmInputChannels || 0;
    this.inputMap = processorOptions.wasmInputMap || undefined;
    this.ready = false;
    this.terminated = false;
    this.frame = 0;
    var self = this;
    this.port.onmessage = function (event) {
      var data = event && event.data;
      if (data && data.type === 'terminate') self.terminated = true;
    };
    try {
      var exports = new WebAssembly.Instance(new WebAssembly.Module(wasmBytesFromOptions(processorOptions)), {}).exports;
      this.exports = exports;
      this.hasMixedRuntime = typeof exports.stopcock_synth_runtime_process_mixed === 'function';
      this.hasDirectRuntime = typeof exports.stopcock_synth_runtime_process_direct === 'function'
        && typeof exports.stopcock_synth_runtime_process_mixed_direct === 'function'
        && typeof exports.stopcock_synth_runtime_output_left_ptr === 'function'
        && typeof exports.stopcock_synth_runtime_output_right_ptr === 'function';
      this.graph = processorOptions.wasmGraph || new Uint8Array(0);
      this.graphPtr = exports.stopcock_synth_alloc(this.graph.length);
      this.u8 = new Uint8Array(exports.memory.buffer);
      this.u8.set(this.graph, this.graphPtr);
      this.runtimePtr = exports.stopcock_synth_runtime_new(this.graphPtr, this.graph.length);
      this.inputPtr = this.inputChannels > 0 ? exports.stopcock_synth_alloc(this.inputChannels * MAX_FRAMES * 4) : 0;
      this.paramPtr = this.paramNames.length > 0 ? exports.stopcock_synth_alloc(this.paramNames.length * MAX_FRAMES * 4) : 0;
      this.paramScalarPtr = this.paramNames.length > 0 ? exports.stopcock_synth_alloc(this.paramNames.length * 4) : 0;
      this.paramFlagsPtr = this.paramNames.length > 0 ? exports.stopcock_synth_alloc(this.paramNames.length) : 0;
      this.leftPtr = this.hasDirectRuntime ? 0 : exports.stopcock_synth_alloc(MAX_FRAMES * 4);
      this.rightPtr = this.hasDirectRuntime ? 0 : exports.stopcock_synth_alloc(MAX_FRAMES * 4);
      this.f32 = new Float32Array(exports.memory.buffer);
      this.u8 = new Uint8Array(exports.memory.buffer);
      this.leftReadPtr = this.hasDirectRuntime && this.runtimePtr !== 0 ? exports.stopcock_synth_runtime_output_left_ptr(this.runtimePtr) : this.leftPtr;
      this.rightReadPtr = this.hasDirectRuntime && this.runtimePtr !== 0 ? exports.stopcock_synth_runtime_output_right_ptr(this.runtimePtr) : this.rightPtr;
      this.inputZero = new Uint8Array(this.inputChannels);
      this.scalarParamCache = new Float32Array(this.paramNames.length);
      this.scalarParamSet = new Uint8Array(this.paramNames.length);
      this.paramFlagCache = new Int8Array(this.paramNames.length);
      for (var flagInit = 0; flagInit < this.paramFlagCache.length; flagInit++) this.paramFlagCache[flagInit] = -1;
      this.blockParamSet = new Uint8Array(this.paramNames.length);
      this.blockParamFrames = new Uint16Array(this.paramNames.length);
      this.ready = this.runtimePtr !== 0;
    } catch (_) {
      this.ready = false;
    }
  }
  process(inputs, outputs, parameters) {
    if (this.terminated) return false;
    var output = outputs[0];
    var frames = output && output[0] ? output[0].length : 128;
    if (!this.ready || frames > MAX_FRAMES) {
      clearOutput(output, frames);
      this.frame += frames;
      return true;
    }
    var f32 = this.f32;
    var inputBase = this.inputPtr >> 2;
    for (var channelIndex = 0; channelIndex < this.inputChannels; channelIndex++) {
      var hostChannel = this.inputMap ? this.inputMap[channelIndex] : channelIndex;
      var input = inputs[hostChannel] && inputs[hostChannel][0] ? inputs[hostChannel][0] : undefined;
      var inputOffset = inputBase + channelIndex * MAX_FRAMES;
      if (input) {
        var copiedSignal = false;
        for (var inputSample = 0; inputSample < frames; inputSample++) {
          var inputValue = input[inputSample] || 0;
          if (inputValue !== 0) {
            if (!this.inputZero[channelIndex]) {
              for (var prefixZero = 0; prefixZero < inputSample; prefixZero++) f32[inputOffset + prefixZero] = 0;
            }
            f32[inputOffset + inputSample] = inputValue;
            for (var copiedSample = inputSample + 1; copiedSample < frames; copiedSample++) f32[inputOffset + copiedSample] = input[copiedSample] || 0;
            this.inputZero[channelIndex] = 0;
            copiedSignal = true;
            break;
          }
        }
        if (!copiedSignal) {
          if (!this.inputZero[channelIndex]) {
            for (var connectedZeroSample = 0; connectedZeroSample < frames; connectedZeroSample++) f32[inputOffset + connectedZeroSample] = 0;
          }
          this.inputZero[channelIndex] = 1;
        }
      } else if (!this.inputZero[channelIndex]) {
        for (var zeroSample = 0; zeroSample < frames; zeroSample++) f32[inputOffset + zeroSample] = 0;
        this.inputZero[channelIndex] = 1;
      }
    }
    var channels = 0;
    if (this.hasMixedRuntime) {
      var hasBlockParams = false;
      var mixedScalarBase = this.paramScalarPtr >> 2;
      var mixedBlockBase = this.paramPtr >> 2;
      for (var mixedIndex = 0; mixedIndex < this.paramNames.length; mixedIndex++) {
        var mixedValues = parameters[this.paramNames[mixedIndex]];
        var mixedScalar = mixedValues ? mixedValues[0] || 0 : 0;
        var mixedIsBlock = false;
        if (mixedValues && mixedValues.length !== 1) {
          for (var mixedDetect = 1; mixedDetect < frames; mixedDetect++) {
            if ((mixedValues[mixedDetect] || 0) !== mixedScalar) {
              mixedIsBlock = true;
              break;
            }
          }
        }
        if (mixedIsBlock) {
          hasBlockParams = true;
          if (this.paramFlagCache[mixedIndex] !== 1) {
            this.u8[this.paramFlagsPtr + mixedIndex] = 1;
            this.paramFlagCache[mixedIndex] = 1;
          }
          var mixedOffset = mixedBlockBase + mixedIndex * MAX_FRAMES;
          if (!this.blockParamSet[mixedIndex] || this.blockParamFrames[mixedIndex] < frames) {
            for (var mixedSample = 0; mixedSample < frames; mixedSample++) f32[mixedOffset + mixedSample] = mixedValues[mixedSample] || 0;
            this.blockParamSet[mixedIndex] = 1;
            this.blockParamFrames[mixedIndex] = frames;
          } else {
            for (var mixedChanged = 0; mixedChanged < frames; mixedChanged++) {
              var mixedBlockValue = mixedValues[mixedChanged] || 0;
              if (f32[mixedOffset + mixedChanged] !== mixedBlockValue) {
                f32[mixedOffset + mixedChanged] = mixedBlockValue;
                for (var mixedCopy = mixedChanged + 1; mixedCopy < frames; mixedCopy++) f32[mixedOffset + mixedCopy] = mixedValues[mixedCopy] || 0;
                break;
              }
            }
          }
        } else {
          if (this.paramFlagCache[mixedIndex] !== 0) {
            this.u8[this.paramFlagsPtr + mixedIndex] = 0;
            this.paramFlagCache[mixedIndex] = 0;
          }
          if (!this.scalarParamSet[mixedIndex] || this.scalarParamCache[mixedIndex] !== mixedScalar) {
            f32[mixedScalarBase + mixedIndex] = mixedScalar;
            this.scalarParamCache[mixedIndex] = mixedScalar;
            this.scalarParamSet[mixedIndex] = 1;
          }
        }
      }
      if (hasBlockParams) {
        channels = this.hasDirectRuntime
          ? this.exports.stopcock_synth_runtime_process_mixed_direct(this.runtimePtr, this.inputPtr, this.inputChannels, MAX_FRAMES, this.paramScalarPtr, this.paramPtr, this.paramFlagsPtr, this.paramNames.length, MAX_FRAMES, frames)
          : this.exports.stopcock_synth_runtime_process_mixed(this.runtimePtr, this.inputPtr, this.inputChannels, MAX_FRAMES, this.paramScalarPtr, this.paramPtr, this.paramFlagsPtr, this.paramNames.length, MAX_FRAMES, frames, this.leftPtr, this.rightPtr);
      } else {
        channels = this.hasDirectRuntime
          ? this.exports.stopcock_synth_runtime_process_direct(this.runtimePtr, this.inputPtr, this.inputChannels, MAX_FRAMES, this.paramScalarPtr, this.paramNames.length, 1, frames)
          : this.exports.stopcock_synth_runtime_process(this.runtimePtr, this.inputPtr, this.inputChannels, MAX_FRAMES, this.paramScalarPtr, this.paramNames.length, 1, frames, this.leftPtr, this.rightPtr);
      }
    } else {
      var allScalarParams = true;
      for (var scalarCheck = 0; scalarCheck < this.paramNames.length; scalarCheck++) {
        var checkValues = parameters[this.paramNames[scalarCheck]];
        if (checkValues && checkValues.length !== 1) {
          var scalarCheckValue = checkValues[0] || 0;
          for (var scalarCheckSample = 1; scalarCheckSample < frames; scalarCheckSample++) {
            if ((checkValues[scalarCheckSample] || 0) !== scalarCheckValue) {
              allScalarParams = false;
              break;
            }
          }
          if (!allScalarParams) break;
        }
      }
      var paramDataPtr = this.paramPtr;
      var paramStride = MAX_FRAMES;
      var paramBase = this.paramPtr >> 2;
      if (allScalarParams) {
        paramDataPtr = this.paramScalarPtr;
        paramStride = 1;
        paramBase = this.paramScalarPtr >> 2;
        for (var fallbackScalarIndex = 0; fallbackScalarIndex < this.paramNames.length; fallbackScalarIndex++) {
          var fallbackScalarValues = parameters[this.paramNames[fallbackScalarIndex]];
          var fallbackScalar = fallbackScalarValues ? fallbackScalarValues[0] || 0 : 0;
          if (!this.scalarParamSet[fallbackScalarIndex] || this.scalarParamCache[fallbackScalarIndex] !== fallbackScalar) {
            f32[paramBase + fallbackScalarIndex] = fallbackScalar;
            this.scalarParamCache[fallbackScalarIndex] = fallbackScalar;
            this.scalarParamSet[fallbackScalarIndex] = 1;
          }
        }
      } else {
        for (var paramIndex = 0; paramIndex < this.paramNames.length; paramIndex++) {
          var values = parameters[this.paramNames[paramIndex]];
          var paramOffset = paramBase + paramIndex * MAX_FRAMES;
          if (values && values.length === 1) {
            var held = values[0];
            for (var heldSample = 0; heldSample < frames; heldSample++) f32[paramOffset + heldSample] = held;
          } else {
            for (var paramSample = 0; paramSample < frames; paramSample++) {
              f32[paramOffset + paramSample] = values ? values[paramSample] || 0 : 0;
            }
          }
        }
      }
      channels = this.hasDirectRuntime
        ? this.exports.stopcock_synth_runtime_process_direct(this.runtimePtr, this.inputPtr, this.inputChannels, MAX_FRAMES, paramDataPtr, this.paramNames.length, paramStride, frames)
        : this.exports.stopcock_synth_runtime_process(this.runtimePtr, this.inputPtr, this.inputChannels, MAX_FRAMES, paramDataPtr, this.paramNames.length, paramStride, frames, this.leftPtr, this.rightPtr);
    }
    if (channels !== 1 && channels !== 2) {
      clearOutput(output, frames);
      this.frame += frames;
      return true;
    }
    var leftBase = this.leftReadPtr >> 2;
    var rightBase = this.rightReadPtr >> 2;
    if (output && output[0]) {
      for (var outputIndex = 0; outputIndex < frames; outputIndex++) {
        output[0][outputIndex] = f32[leftBase + outputIndex];
        if (output[1]) output[1][outputIndex] = channels === 2 ? f32[rightBase + outputIndex] : f32[leftBase + outputIndex];
      }
    }
    this.frame += frames;
    return true;
  }
}`
}
