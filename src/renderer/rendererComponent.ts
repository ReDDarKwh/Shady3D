export abstract class RendererComponent {
  abstract init(device: GPUDevice): void;

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
