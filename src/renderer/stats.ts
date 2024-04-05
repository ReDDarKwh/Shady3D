import { Pane } from "tweakpane";
import { RendererComponent } from "./RendererComponent";

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
  fps: number;
  cpuMS: number;
  gpuMS: number;
}

export class Stats extends RendererComponent {
  private _querySet!: GPUQuerySet;
  private _resolveBuffer!: GPUBuffer;
  private _resultBuffer!: GPUBuffer;
  private _resultBuffers: GPUBuffer[] = [];
  private _state: "free" | "need resolve" | "wait for result" = "free";

  private _fps: RollingAverage = new RollingAverage();
  private _gpuMS: RollingAverage = new RollingAverage();
  private _cpuMS: RollingAverage = new RollingAverage();

  private _gui?: Pane;
  private _data: StatData = { gpuMS: 0, cpuMS: 0, fps: 0 } as StatData;

  private _device!: GPUDevice;

  init(device: GPUDevice): void {
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
      readonly: true,
    });

    this._gui.addBinding(this._data, "gpuMS", {
      readonly: true,
      view: "graph",
      min: 0,
      max: 16,
    });

    this._gui.addBinding(this._data, "fps", {
      readonly: true,
    });

    this._gui.addBinding(this._data, "fps", {
      readonly: true,
      view: "graph",
      min: 0,
      max: 60,
    });
  }

  private resolveTiming(encoder: GPUCommandEncoder) {
    assert(this._state === "need resolve", "must call addTimestampToPass");
    this._state = "wait for result";

    this._resultBuffer =
      this._resultBuffers.pop() ||
      this._device.createBuffer({
        size: this._resolveBuffer!.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

    encoder.resolveQuerySet(
      this._querySet,
      0,
      this._querySet.count,
      this._resolveBuffer!,
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

  override onFinalRenderPassCreated(
    encoder: GPUCommandEncoder,
    pass: GPURenderPassEncoder
  ): void {
    this._state = "need resolve";
    const resolve = () => this.resolveTiming(encoder);
    pass.end = (function (origFn) {
      return function () {
        origFn.call(this);
        resolve();
      };
    })(pass.end);
  }

  override onFinalRenderPassDescriptorCreated(
    descriptor: GPURenderPassDescriptor
  ): void {
    descriptor.timestampWrites = {
      querySet: this._querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
  }

  override onRenderStart(_dt: number): void {
    this._fps.addSample(1 / _dt);
    this._data.fps = this._fps.get();
  }

  override onRenderEnd(): void {
    this.getResult().then();
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
  }
}
