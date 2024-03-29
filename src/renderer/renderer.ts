//import { GUI } from "dat.gui";
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
import { Node3D } from "./node3D";

class RendererSettings {
  initialCameraPosition = vec3.create(2, 2, 2);
  initialCameraTarget = vec3.create(0, 0, 0);
  maxObjects = 10000;
  dynamicUniformBindingOffset = 256;
}

abstract class Pipeline {
  private _pipeline: GPURenderPipeline;
  private _renderPassDescriptor: any;
  private _context: GPUCanvasContext;

  ApplyPipeline(encoder: GPUCommandEncoder) {
    this._renderPassDescriptor.colorAttachments[0].view = this._context
      .getCurrentTexture()
      .createView();

    const passEncoder = encoder.beginRenderPass(this._renderPassDescriptor);
    passEncoder.setPipeline(this._pipeline);

    return passEncoder;
  }

  /**
   *
   */
  constructor({
    pipeline,
    renderPassDescriptor,
    context,
  }: {
    pipeline: GPURenderPipeline;
    renderPassDescriptor: any;
    context: GPUCanvasContext;
  }) {
    this._pipeline = pipeline;
    this._renderPassDescriptor = renderPassDescriptor;
    this._context = context;
  }
}

class ForwardRenderPipeline extends Pipeline {
  /**
   *
   */
  constructor({
    device,
    format,
    context,
    bindGroupLayouts,
  }: {
    device: GPUDevice;
    format: GPUTextureFormat;
    context: GPUCanvasContext;
    bindGroupLayouts: GPUBindGroupLayout[];
  }) {
    const shader = new BasicShader(device);

    const depthTexture = device.createTexture({
      size: [context.canvas.width, context.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    super({
      pipeline: device.createRenderPipeline({
        layout: device.createPipelineLayout({
          label: "render pipeline layout",
          bindGroupLayouts,
        }),
        vertex: {
          module: shader.module,
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
          module: shader.module,
          entryPoint: "fragment_main",
          targets: [
            {
              format,
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
      }),
      renderPassDescriptor: {
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
      },
      context,
    });
  }
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
  private _canvasFormat: GPUTextureFormat;
  private _verticesBuffer?: GPUBuffer;
  private _scene: Node3D;
  private _pipeline: Pipeline;
  private _bindGroupLayouts: GPUBindGroupLayout[] = [];
  private _modelBG?: GPUBindGroup;
  private _matrixBuffer?: GPUBuffer;
  private _update?: ((dt: number) => void) | undefined;
  
  public set update(value: ((dt: number) => void) | undefined) {
    this._update = value;
  }

  get scene(){
    return this._scene;
  }

  getModelViewProjectionMatrix(model: Mat4, view: Mat4) {
    return mat4.multiply(this._projectionMatrix, mat4.multiply(view, model));
  }

  getViewMatrix(deltaTime: number) {
    return this._camera.update(deltaTime, this._inputHandler());
  }

  private renderFrame() {
    const now = Date.now();
    const deltaTime = (now - this._lastFrameMS) / 1000;
    this._lastFrameMS = now;

    if(this._update){
      this._update(deltaTime);
    }

    const nodes = this._scene.getChildren();

    const viewMatrix = this.getViewMatrix(deltaTime);

    const commandEncoder = this._device.createCommandEncoder();
    const passEncoder = this._pipeline.ApplyPipeline(commandEncoder);

    passEncoder.setVertexBuffer(0, this._verticesBuffer!);

    let i = 0;
    for (let n of nodes) {
      const mvp = this.getModelViewProjectionMatrix(
        n.worldSpaceTransform,
        viewMatrix
      ) as Float32Array;

      this._device.queue.writeBuffer(
        this._matrixBuffer!,
        i * this._settings.dynamicUniformBindingOffset,
        mvp
      );

      passEncoder.setBindGroup(0, this._modelBG!, [
        i * this._settings.dynamicUniformBindingOffset,
      ]);
      passEncoder.draw(cubeVertexCount);

      i++;
    }

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
      target: this._settings.initialCameraTarget,
    });

    this._inputHandler = createInputHandler(window, this._canvas);

    this._scene = new Node3D();

    const aspect = this._canvas.width / this._canvas.height;
    this._projectionMatrix = mat4.perspective(
      (2 * Math.PI) / 5,
      aspect,
      1,
      100.0
    );

    this.initBindGroupLayouts();

    this._pipeline = new ForwardRenderPipeline({
      device,
      format: this._canvasFormat,
      context: this._context,
      bindGroupLayouts: this._bindGroupLayouts,
    });

    this.initModelBindGroup();

    this.renderFrame();
  }

  initModelBindGroup() {
    const bufferSize = this._device.limits.minUniformBufferOffsetAlignment * this._settings.maxObjects;

    this._matrixBuffer = this._device.createBuffer({
      label: "matrix buffer",
      size: bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._verticesBuffer = this._device.createBuffer({
      size: cubeVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });

    new Float32Array(this._verticesBuffer.getMappedRange()).set(
      cubeVertexArray
    );

    this._verticesBuffer.unmap();

    this._modelBG = this._device.createBindGroup({
      layout: this._bindGroupLayouts![0],
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this._matrixBuffer,
            size: this._device.limits.minUniformBufferOffsetAlignment,
          },
        },
      ],
    });
  }

  initBindGroupLayouts() {
    this._bindGroupLayouts.push(
      this._device.createBindGroupLayout({
        label: "Model BGL",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: {
              type: "uniform",
              hasDynamicOffset: true,
            },
          },
        ],
      })
    );
  }

  static async init() {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    console.log(adapter.limits);

    const device = await adapter.requestDevice();

    return new Renderer(device);
  }
}
