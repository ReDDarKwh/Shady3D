import { GUI } from "dat.gui";
import Camera, { WASDCamera } from "./camera";
import { Mat4, mat4, vec3 } from "wgpu-matrix";
import { InputHandler, createInputHandler } from "./input";
import {
  cubePositionOffset,
  cubeUVOffset,
  cubeVertexArray,
  cubeVertexCount,
  cubeVertexSize,
} from "./meshes/cube";
import { BasicShader } from "./shaders/basic";

class RendererSettings {
  initialCameraPosition = vec3.create(2, 2, 2);
  initialCameraTarget = vec3.create(0, 0, 0);
}

export class Renderer {
  private _canvas: HTMLCanvasElement;
  //private _gui: GUI;
  private _context: GPUCanvasContext;
  private _device: GPUDevice;
  private _settings: RendererSettings;
  private _lastFrameMS = Date.now();
  private _camera: Camera;
  private _inputHandler: InputHandler;
  private _projectionMatrix: Mat4;
  private _modelViewProjectionMatrix: Mat4;
  private _canvasFormat: GPUTextureFormat;
  private _renderPassDescriptor: any;
  private _uniformBindGroup: GPUBindGroup | undefined;
  private _pipeline: GPURenderPipeline | undefined;
  private _uniformBuffer: GPUBuffer | undefined;
  private _verticesBuffer: GPUBuffer | undefined;

  async setupRenderPipeline() {
    this._verticesBuffer = this._device.createBuffer({
      size: cubeVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this._verticesBuffer.getMappedRange()).set(
      cubeVertexArray
    );
    this._verticesBuffer.unmap();

    const cubeWGSL = new BasicShader(this._device);

    this._pipeline = this._device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: cubeWGSL.module,
        entryPoint: "vertex_main",
        buffers: [
          {
            arrayStride: cubeVertexSize,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: cubePositionOffset,
                format: "float32x4",
              },
              {
                // uv
                shaderLocation: 1,
                offset: cubeUVOffset,
                format: "float32x2",
              },
            ],
          },
        ],
      },
      fragment: {
        module: cubeWGSL.module,
        entryPoint: "fragment_main",
        targets: [
          {
            format: this._canvasFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: "depth24plus",
      },
    });

    const depthTexture = this._device.createTexture({
      size: [this._canvas.width, this._canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const uniformBufferSize = 4 * 16; // 4x4 matrix
    this._uniformBuffer = this._device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Fetch the image and upload it into a GPUTexture.
    let cubeTexture: GPUTexture;
    {
      const response = await fetch("https://i.kym-cdn.com/entries/icons/original/000/022/134/elmo.jpg");
      const imageBitmap = await createImageBitmap(await response.blob());

      cubeTexture = this._device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: cubeTexture },
        [imageBitmap.width, imageBitmap.height]
      );
    }

    // Create a sampler with linear filtering for smooth interpolation.
    const sampler = this._device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this._uniformBindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this._uniformBuffer,
          },
        },
        {
          binding: 1,
          resource: sampler,
        },
        {
          binding: 2,
          resource: cubeTexture.createView(),
        },
      ],
    });

    this._renderPassDescriptor = {
      colorAttachments: [
        {
          view: undefined, // Assigned later
          clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),

        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    };

    requestAnimationFrame(this.renderFrame.bind(this));
  }

  getModelViewProjectionMatrix(deltaTime: number) {
    const viewMatrix = this._camera.update(deltaTime, this._inputHandler());
    mat4.multiply(
      this._projectionMatrix,
      viewMatrix,
      this._modelViewProjectionMatrix
    );
    return this._modelViewProjectionMatrix as Float32Array;
  }

  private renderFrame() {
    const now = Date.now();
    const deltaTime = (now - this._lastFrameMS) / 1000;
    this._lastFrameMS = now;

    const modelViewProjection = this.getModelViewProjectionMatrix(deltaTime);
    this._device.queue.writeBuffer(
      this._uniformBuffer!,
      0,
      modelViewProjection.buffer,
      modelViewProjection.byteOffset,
      modelViewProjection.byteLength
    );
    this._renderPassDescriptor.colorAttachments[0].view = this._context
      .getCurrentTexture()
      .createView();

    const commandEncoder = this._device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(
      this._renderPassDescriptor
    );
    passEncoder.setPipeline(this._pipeline!);
    passEncoder.setBindGroup(0, this._uniformBindGroup!);
    passEncoder.setVertexBuffer(0, this._verticesBuffer!);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();
    this._device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(this.renderFrame.bind(this));
  }

  /**
   *
   */
  private constructor(device: GPUDevice) {
    this._device = device;
    //this._gui = new GUI();
    this._settings = new RendererSettings();

    const appElement = document.querySelector<HTMLDivElement>("#app")!;
    appElement.innerHTML = `
            <canvas id="render"></canvas>
        `;

    this._canvas = document.querySelector("#render") as HTMLCanvasElement;

    if (!this._canvas) {
      throw new Error("Yo! No canvas found.");
    }

    this._context = this._canvas.getContext("webgpu")!;

    this._canvas.width = appElement.clientWidth;
    this._canvas.height = appElement.clientHeight;

    if (!this._context) {
      throw new Error("Yo! No Canvas GPU context found.");
    }

    this._canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this._context.configure({
      device: this._device,
      format: this._canvasFormat,
    });

    this._camera = new WASDCamera({
      position: this._settings.initialCameraPosition,
      target: this._settings.initialCameraTarget
    });

    this._inputHandler = createInputHandler(window, this._canvas);

    const aspect = this._canvas.width / this._canvas.height;
    this._projectionMatrix = mat4.perspective(
      (2 * Math.PI) / 5,
      aspect,
      1,
      100.0
    );
    this._modelViewProjectionMatrix = mat4.create();

    //requestAnimationFrame(this.renderFrame);
  }

  static async init() {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    return new Renderer(device);
  }
}
