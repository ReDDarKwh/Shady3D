import { Renderer } from "./renderer";

export abstract class RendererComponent {
  protected _renderer!: Renderer;
  protected _device!: GPUDevice;

  init(device: GPUDevice): void {
    this._device = device;
  }

  onRendererInitiated(renderer: Renderer): void {
    this._renderer = renderer;
  }

  onRenderStart(_dt: number): void {}

  onRenderEnd(): void {}

  onFinalRenderPassDescriptorCreated(
    _descriptor: GPURenderPassDescriptor
  ): void {}

  onFinalRenderPassCreated(
    _encoder: GPUCommandEncoder,
    _pass: GPURenderPassEncoder
  ): void {}
}
