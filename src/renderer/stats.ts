import { Pane } from "tweakpane";

function assert(cond: boolean, msg = "") {
  if (!cond) {
    throw new Error(msg);
  }
}

class RollingAverage {
  #total = 0;
  #samples: number[] = [];
  #cursor = 0;
  #numSamples: number;
  constructor(numSamples = 30) {
    this.#numSamples = numSamples;
  }
  addSample(v: number) {
    this.#total += v - (this.#samples[this.#cursor] || 0);
    this.#samples[this.#cursor] = v;
    this.#cursor = (this.#cursor + 1) % this.#numSamples;
  }
  get() {
    return this.#total / this.#samples.length;
  }
}

interface StatData {
  gpuMS: number;
}

export class Stats {
  private _device;
  private _querySet;
  private _resolveBuffer;
  private _resultBuffer?: GPUBuffer;
  private _resultBuffers: GPUBuffer[] = [];
  private _state: "free" | "need resolve" | "wait for result" = "free";
  private _gpuMS: RollingAverage = new RollingAverage();
  private _fps: RollingAverage = new RollingAverage();
  private _jsMS: RollingAverage = new RollingAverage();

  private _gui: Pane;
  private _data: StatData = {gpuMS: 0} as StatData;

  constructor(device: GPUDevice) {
    this._device = device;
    this._querySet = device.createQuerySet({
      type: "timestamp",
      count: 2,
    });
    this._resolveBuffer = device.createBuffer({
      size: this._querySet.count * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });

    this._gui = new Pane();
    
    this._gui.addBinding(this._data, "gpuMS", {
      readonly: true
    });

    this._gui.addBinding(this._data, "gpuMS", {
      readonly: true,
      view: "graph",
      min: 0,
      max: 16
    });
  }

  private beginTimestampPass(
    encoder: GPUCommandEncoder,
    fnName: string,
    descriptor: GPUObjectDescriptorBase
  ) {
    assert(this._state === "free", "state not free");
    this._state = "need resolve";

    const pass: GPURenderPassEncoder | GPUComputePassEncoder = (encoder as any)[
      fnName
    ]({
      ...descriptor,
      ...{
        timestampWrites: {
          querySet: this._querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      },
    });

    const resolve = () => this.resolveTiming(encoder);
    pass.end = (function (origFn) {
      return function () {
        origFn.call(this);
        resolve();
      };
    })(pass.end);

    return pass;
  }

  beginRenderPass(
    encoder: GPUCommandEncoder,
    descriptor: GPURenderPassDescriptor
  ) {
    return this.beginTimestampPass(
      encoder,
      "beginRenderPass",
      descriptor
    ) as GPURenderPassEncoder;
  }

  beginComputePass(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor
  ) {
    return this.beginTimestampPass(
      encoder,
      "beginComputePass",
      descriptor
    ) as GPUComputePassEncoder;
  }

  private resolveTiming(encoder: GPUCommandEncoder) {
    assert(this._state === "need resolve", "must call addTimestampToPass");
    this._state = "wait for result";

    this._resultBuffer =
      this._resultBuffers.pop() ||
      this._device.createBuffer({
        size: this._resolveBuffer.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

    encoder.resolveQuerySet(
      this._querySet,
      0,
      this._querySet.count,
      this._resolveBuffer,
      0
    );
    encoder.copyBufferToBuffer(
      this._resolveBuffer,
      0,
      this._resultBuffer,
      0,
      this._resultBuffer.size
    );
  }

  async getResult() {
    assert(this._state === "wait for result", "must call resolveTiming");
    this._state = "free";

    const resultBuffer = this._resultBuffer!;
    await resultBuffer.mapAsync(GPUMapMode.READ);
    const times = new BigInt64Array(resultBuffer.getMappedRange());
    const duration = Number(times[1] - times[0]);
    resultBuffer.unmap();
    this._resultBuffers.push(resultBuffer);
    this._gpuMS.addSample(duration / 1000000);
    this._data.gpuMS = this._gpuMS.get();
    return this._data.gpuMS;
  }
}
