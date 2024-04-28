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
} from "./models/cube";
import { BasicShader } from "./shaders/basic";
import { Node3D } from "./node3D";
import { RendererComponent } from "./rendererComponent";
import { Pane } from "tweakpane";
import { TinyGltfWebGpu } from "./models/gltf/gltfLoader";

class RendererSettings {
  initialCameraPosition = vec3.create(2, 2, 2);
  initialCameraTarget = vec3.create(0, 0, 0);
  maxObjects = 10000;
  dynamicUniformBindingOffset = 256;
}

const enum ERendererBufferLayouts {
  node,
  model,
}

export class Renderer {
  private _canvas: HTMLCanvasElement;
  private _context: GPUCanvasContext;
  private _device: GPUDevice;
  private _settings: RendererSettings;
  private _lastFrameMS = 0;
  private _camera: Camera;
  private _inputHandler: InputHandler;
  private _projectionMatrix: Mat4;
  private _canvasFormat: GPUTextureFormat;
  private _verticesBuffer?: GPUBuffer;
  private _scene: Node3D;
  private _bindGroupLayouts: Map<ERendererBufferLayouts, GPUBindGroupLayout> =
    new Map();
  private _modelBG?: GPUBindGroup;
  private _matrixBuffer?: GPUBuffer;
  private _update?: ((dt: number) => void) | undefined;
  private _components: RendererComponent[];

  private _renderPipeline?: GPURenderPipeline;
  private _finalRenderPassDescriptor?: GPURenderPassDescriptor;
  public meshLoader: TinyGltfWebGpu;

  private nodeGpuData = new Map();
  private primitiveGpuData = new Map();

  private _gui: Pane;
  private _mainShader: BasicShader;
  private _modelPipelineLayout!: GPUPipelineLayout;
  private _gltf: any;

  public get gui(): Pane {
    return this._gui;
  }

  public set update(value: ((dt: number) => void) | undefined) {
    this._update = value;
  }

  get scene() {
    return this._scene;
  }

  setupMeshNode(node: any) {
    // Create a uniform buffer for this node and populate it with the node's world transform
    // and normal matrix (transpose inverse of the world matrix).
    const nodeUniformBuffer = this._device.createBuffer({
      size: 32 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(nodeUniformBuffer, 0, node.worldMatrix);
    this._device.queue.writeBuffer(
      nodeUniformBuffer,
      16 * Float32Array.BYTES_PER_ELEMENT,
      node.normalMatrix
    );

    // Create a bind group containing the uniform buffer for this node.
    const bindGroup = this._device.createBindGroup({
      label: `glTF Node BindGroup`,
      layout: this._bindGroupLayouts.get(ERendererBufferLayouts.node)!,
      entries: [
        {
          binding: 0, // Node uniforms
          resource: { buffer: nodeUniformBuffer },
        },
      ],
    });

    this.nodeGpuData.set(node, { bindGroup });
  }

  private static readonly _ShaderLocations: { [key: string]: number } = {
    POSITION: 0,
    NORMAL: 1,
  };

  setupPrimitive(gltf: any, primitive: any) {
    const bufferLayout: GPUVertexBufferLayout[] = [];
    const gpuBuffers = [];
    let drawCount = 0;

    // Loop through every attribute in the primitive and build a description of the vertex
    // layout, which is needed to create the render pipeline.
    for (const [attribName, accessorIndex] of Object.entries(
      primitive.attributes as { [key: string]: number }
    )) {
      const accessor = gltf.accessors[accessorIndex];
      const bufferView = gltf.bufferViews[accessor.bufferView];

      // Get the shader location for this attribute. If it doesn't have one skip over the
      // attribute because we don't need it for rendering (yet).
      const shaderLocation = Renderer._ShaderLocations[attribName];
      if (shaderLocation === undefined) {
        continue;
      }

      // Create a new vertex buffer entry for the render pipeline that describes this
      // attribute. Implicitly assumes that one buffer will be bound per attribute, even if
      // the attribute data is interleaved.
      bufferLayout.push({
        arrayStride:
          bufferView.byteStride ||
          TinyGltfWebGpu.packedArrayStrideForAccessor(accessor),
        attributes: [
          {
            shaderLocation,
            format: TinyGltfWebGpu.gpuFormatForAccessor(accessor),
            offset: accessor.byteOffset,
          } as GPUVertexAttribute,
        ],
      });

      // Since we're skipping some attributes, we need to track the WebGPU buffers that are
      // used here so that we can bind them in the correct order at draw time.
      gpuBuffers.push(gltf.gpuBuffers[accessor.bufferView]);

      // All attributes should have the same count, which will be the draw count for
      // non-indexed geometry.
      drawCount = accessor.count;
    }

    // Create a render pipeline that is compatible with the vertex buffer layout for this
    // primitive. Doesn't yet take into account any material properties.
    const module = this._mainShader.module;
    const pipeline = this._device.createRenderPipeline({
      label: "glTF renderer pipeline",
      layout: this._modelPipelineLayout,
      vertex: {
        module,
        entryPoint: "vertexMain",
        buffers: bufferLayout,
      },
      primitive: {
        topology: TinyGltfWebGpu.gpuPrimitiveTopologyForMode(primitive.mode),
        cullMode: "back",
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: this._canvasFormat,
          },
        ],
      },
    });

    // Store data needed to render this primitive.
    const gpuPrimitive = {
      pipeline,
      buffers: gpuBuffers,
      drawCount,
      indexBuffer: 0,
      indexOffset: 0,
      indexType: "",
    };

    // If the primitive has index data, store the index buffer, offset, type, count as well.
    if ("indices" in primitive) {
      const accessor = gltf.accessors[primitive.indices];
      gpuPrimitive.indexBuffer = gltf.gpuBuffers[accessor.bufferView];
      gpuPrimitive.indexOffset = accessor.byteOffset;
      gpuPrimitive.indexType = TinyGltfWebGpu.gpuIndexFormatForComponentType(
        accessor.componentType
      );
      gpuPrimitive.drawCount = accessor.count;
    }

    this.primitiveGpuData.set(primitive, gpuPrimitive);
  }

  getModelViewProjectionMatrix(model: Mat4, view: Mat4) {
    return mat4.multiply(this._projectionMatrix, mat4.multiply(view, model));
  }

  getViewMatrix(deltaTime: number) {
    return this._camera.update(deltaTime, this._inputHandler());
  }

  getRenderPass(encoder: GPUCommandEncoder) {
    (
      this._finalRenderPassDescriptor!
        .colorAttachments as GPURenderPassColorAttachment[]
    )[0].view = this._context.getCurrentTexture().createView();

    const passEncoder = encoder.beginRenderPass(
      this._finalRenderPassDescriptor!
    );
    this._components.forEach((x) =>
      x.onFinalRenderPassCreated(encoder, passEncoder)
    );

    //passEncoder.setPipeline(this._renderPipeline!);

    return passEncoder;
  }

  private renderFrame(now: number) {
    const deltaTime = (now - this._lastFrameMS) / 1000;
    this._lastFrameMS = now;

    this._components.forEach((x) => x.onRenderStart(deltaTime));

    if (this._update) {
      this._update(deltaTime);
    }

    const nodes = this._scene.getChildren();

    const viewMatrix = this.getViewMatrix(deltaTime);

    const commandEncoder = this._device.createCommandEncoder();
    const renderPass = this.getRenderPass(commandEncoder);

    // Loop through all of the nodes that we created transform uniforms for in the
    // constructor and set those bind groups now.
    for (const [node, gpuNode] of this.nodeGpuData) {
      renderPass.setBindGroup(1, gpuNode.bindGroup);

      // Find the mesh for this node and loop through all of its primitives.
      const mesh = this._gltf.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        const gpuPrimitive = this.primitiveGpuData.get(primitive);

        // Set the pipeline for this primitive.
        renderPass.setPipeline(gpuPrimitive.pipeline);

        // Set the vertex buffers for this primitive.
        for (let i = 0 ; i < gpuPrimitive.buffers.length; i++) {
          renderPass.setVertexBuffer(i, gpuPrimitive.buffers[i]);
        }

        if (gpuPrimitive.indexBuffer) {
          // If the primitive has indices, set the index buffer and draw indexed geometry.
          renderPass.setIndexBuffer(
            gpuPrimitive.indexBuffer,
            gpuPrimitive.indexType,
            gpuPrimitive.indexOffset
          );
          renderPass.drawIndexed(gpuPrimitive.drawCount);
        } else {
          // Otherwise draw non-indexed geometry.
          renderPass.draw(gpuPrimitive.drawCount);
        }
      }
    }

    //passEncoder.setVertexBuffer(0, this._verticesBuffer!);

    // let i = 0;
    // for (let n of nodes) {
    //   const mvp = this.getModelViewProjectionMatrix(
    //     n.worldSpaceTransform,
    //     viewMatrix
    //   ) as Float32Array;

    //   this._device.queue.writeBuffer(
    //     this._matrixBuffer!,
    //     i * this._settings.dynamicUniformBindingOffset,
    //     mvp
    //   );

    //   passEncoder.setBindGroup(0, this._modelBG!, [
    //     i * this._settings.dynamicUniformBindingOffset,
    //   ]);
    //   passEncoder.draw(cubeVertexCount);

    //   i++;
    // }

    renderPass.end();

    this._device.queue.submit([commandEncoder.finish()]);

    this._components.forEach((x) => x.onRenderEnd());

    requestAnimationFrame(this.renderFrame.bind(this));
  }

  /**
   *
   */
  private constructor(device: GPUDevice, components?: RendererComponent[], gltf?: any) {
    this._device = device;
    this._components = components ?? [];
    this._settings = new RendererSettings();
    this._gui = new Pane({ title: "Shady3D", expanded: false });

    this._gltf = gltf;

    this._mainShader = new BasicShader(this._device, Renderer._ShaderLocations);

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

    this.initRenderPass();

    this.initModelBindGroup();

    for (const node of gltf.nodes) {
      if ('mesh' in node) {
        this.setupMeshNode(node);
      }
    }

    // Loop through each primitive of each mesh and create a compatible WebGPU pipeline.
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        this.setupPrimitive(gltf, primitive);
      }
    }

    this.renderFrame(0);

    this._components.forEach((x) => x.onRendererInitiated(this));




  }

  initRenderPass() {
    // const shader = new BasicShader(this._device);
    const depthTexture = this._device.createTexture({
      size: [this._context.canvas.width, this._context.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // this._renderPipeline = this._device.createRenderPipeline({
    //   layout: this._device.createPipelineLayout({
    //     label: "render pipeline layout",
    //     bindGroupLayouts: this._bindGroupLayouts,
    //   }),
    //   vertex: {
    //     module: shader.module,
    //     entryPoint: "vertex_main",
    //     buffers: [
    //       {
    //         arrayStride: cubeVertexSize,
    //         attributes: [
    //           {
    //             // position
    //             shaderLocation: 0,
    //             offset: cubePositionOffset,
    //             format: "float32x4",
    //           },
    //           {
    //             // uv
    //             shaderLocation: 1,
    //             offset: cubeUVOffset,
    //             format: "float32x2",
    //           },
    //         ],
    //       },
    //     ],
    //   },
    //   fragment: {
    //     module: shader.module,
    //     entryPoint: "fragment_main",
    //     targets: [
    //       {
    //         format: this._canvasFormat,
    //       },
    //     ],
    //   },
    //   primitive: {
    //     topology: "triangle-list",
    //     cullMode: "back",
    //   },
    //   depthStencil: {
    //     depthWriteEnabled: true,
    //     depthCompare: "less",
    //     format: "depth24plus",
    //   },
    // });
    this._finalRenderPassDescriptor = {
      colorAttachments: [
        {
          view: this._context.getCurrentTexture().createView(), // Assigned later
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
    } as GPURenderPassDescriptor;
    this._components.forEach((x) =>
      x.onFinalRenderPassDescriptorCreated(this._finalRenderPassDescriptor!)
    );
  }

  initModelBindGroup() {
    const bufferSize =
      this._device.limits.minUniformBufferOffsetAlignment *
      this._settings.maxObjects;

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
      layout: this._bindGroupLayouts.get(ERendererBufferLayouts.model)!,
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
    this._bindGroupLayouts.set(
      ERendererBufferLayouts.node,
      this._device.createBindGroupLayout({
        label: `glTF Node BindGroupLayout`,
        entries: [
          {
            binding: 0, // Node uniforms
            visibility: GPUShaderStage.VERTEX,
            buffer: {},
          },
        ],
      })
    );

    this._bindGroupLayouts.set(
      ERendererBufferLayouts.model,
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

    this._modelPipelineLayout = this._device.createPipelineLayout({
      label: "glTF Pipeline Layout",
      bindGroupLayouts: this._bindGroupLayouts.values(),
    });
  }

  static async init(components?: RendererComponent[], meshUrl: string) {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    console.log(adapter.limits);

    const device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
    });

    if (!device) {
      throw new Error("No GPU device found.");
    }

    components?.forEach((x) => x.init(device));

    
    const meshLoader = new TinyGltfWebGpu(device);
    const gltf = await meshLoader.loadFromUrl('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF/Duck.gltf');

    return new Renderer(device, components, gltf);
  }
}
