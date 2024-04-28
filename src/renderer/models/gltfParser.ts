// import { BufferData, GltfAsset, GltfLoader } from "gltf-loader-ts";
// import {
//   Accessor,
//   BufferView,
//   MeshPrimitive,
// } from "gltf-loader-ts/lib/gltf";

// let loader = new GltfLoader();
// let uri =
//   "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF/Duck.gltf";
// let asset = await loader.load(uri);
// let gltf = asset.gltf;
// console.log(gltf);


// interface PipelineData {
//   pipeline: GPURenderPipeline;
//   gpuBuffers: GPUBuffer[];
//   drawCount: number;
// }

// export class gltfParser {
//   private _device: GPUDevice;
//   private _canvasFormat: GPUTextureFormat;

//   constructor(device: GPUDevice, canvasFormat: GPUTextureFormat) {
//     this._device = device;
//     this._canvasFormat = canvasFormat;
//   }

//   static readonly numberOfComponentsForType: { [key: string]: number } = {
//     SCALAR: 1,
//     VEC2: 2,
//     VEC3: 3,
//     VEC4: 4,
//   };

//   static readonly gpuPrimitiveTopologyForMode: {
//     [key: number]: GPUPrimitiveTopology;
//   } = {
//     4: "triangle-list",
//     5: "triangle-strip",
//     1: "line-list",
//     3: "line-strip",
//     0: "point-list",
//   };

//   private static gpuFormatForAccessor(accessor: Accessor) {
//     const norm = accessor.normalized ? "norm" : "int";
//     const count = gltfParser.numberOfComponentsForType[accessor.type];
//     const x = count > 1 ? `x${count}` : "";
//     switch (accessor.componentType) {
//       case WebGLRenderingContext.BYTE:
//         return `s${norm}8${x}`;
//       case WebGLRenderingContext.UNSIGNED_BYTE:
//         return `u${norm}8${x}`;
//       case WebGLRenderingContext.SHORT:
//         return `s${norm}16${x}`;
//       case WebGLRenderingContext.UNSIGNED_SHORT:
//         return `u${norm}16${x}`;
//       case WebGLRenderingContext.UNSIGNED_INT:
//         return `u${norm}32${x}`;
//       case WebGLRenderingContext.FLOAT:
//         return `float32${x}`;
//     }
//   }

//   static readonly ShaderLocations: { [key: string]: number } = {
//     POSITION: 0,
//     NORMAL: 1,
//   };

//   async createVertexBufferForBufferView(
//     bufferView: BufferView,
//     bufferData: BufferData
//   ) {
//     const buffer = await bufferData.get(bufferView.buffer);

//     const gpuBuffer = this._device.createBuffer({
//       // Round the buffer size up to the nearest multiple of 4.
//       size: Math.ceil(bufferView.byteLength / 4) * 4,
//       usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
//       mappedAtCreation: true,
//     });

//     const gpuBufferArray = new Uint8Array(gpuBuffer.getMappedRange());
//     gpuBufferArray.set(
//       new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength)
//     );
//     gpuBuffer.unmap();

//     return gpuBuffer;
//   }

//   private static CreateGPUObjects(gltfAsset: GltfAsset){



//   }

//   // This will be used to store WebGPU information about our glTF primitives.

//   private _primitiveGpuData: Map<MeshPrimitive, PipelineData> = new Map();

//   async setupPrimitive(gltfAsset: GltfAsset, primitive: MeshPrimitive) {
//     const bufferLayout: GPUVertexBufferLayout[] = [];
//     const gpuBuffers: GPUBuffer[] = [];
//     let drawCount = 0;

//     await gltfAsset.preFetchAll();

//     // Loop through every attribute in the primitive and build a description of the vertex
//     // layout, which is needed to create the render pipeline.
//     for (const [attribName, accessorIndex] of Object.entries(
//       primitive.attributes
//     )) {
//       const accessor = gltfAsset.gltf.accessors![accessorIndex];
//       const bufferView = gltfAsset.gltf.bufferViews![accessor.bufferView!];

//       // Get the shader location for this attribute. If it doesn't have one skip over the
//       // attribute because we don't need it for rendering (yet).
//       const shaderLocation = gltfParser.ShaderLocations[attribName];
//       if (shaderLocation === undefined) {
//         continue;
//       }

//       // Create a new vertex buffer entry for the render pipeline that describes this
//       // attribute. Implicitly assumes that one buffer will be bound per attribute, even if
//       // the attribute data is interleaved.
//       bufferLayout.push({
//         arrayStride: bufferView.byteStride!,
//         attributes: [
//           {
//             shaderLocation,
//             format: gltfParser.gpuFormatForAccessor(accessor),
//             offset: accessor.byteOffset,
//           } as GPUVertexAttribute,
//         ],
//       });

//       // Since we're skipping some attributes, we need to track the WebGPU buffers that are
//       // used here so that we can bind them in the correct order at draw time.
//       gpuBuffers.push(
//         await this.createVertexBufferForBufferView(
//           bufferView,
//           gltfAsset.bufferData
//         )
//       );

//       // All attributes should have the same count, which will be the draw count for
//       // non-indexed geometry.
//       drawCount = accessor.count;
//     }

//     // Create a render pipeline that is compatible with the vertex buffer layout for this primitive.
//     const module = this.getShaderModule();
//     const pipeline = this._device.createRenderPipeline({
//       layout: "auto",
//       vertex: {
//         module,
//         entryPoint: "vertexMain",
//         buffers: bufferLayout,
//       },
//       fragment: {
//         module: module,
//         entryPoint: "fragment_main",
//         targets: [
//           {
//             format: this._canvasFormat,
//           },
//         ],
//       },
//       primitive: {
//         topology: gltfParser.gpuPrimitiveTopologyForMode[primitive.mode || 4],
//         cullMode: "back",
//       },
//       depthStencil: {
//         depthWriteEnabled: true,
//         depthCompare: "less",
//         format: "depth24plus",
//       },
//     });


//     // if ('indices' in primitive) {
//     //   const accessor = gltf.accessors![primitive.indices!];
//     //   gpuPrimitive.indexBuffer = ;
//     //   gpuPrimitive.indexOffset = accessor.byteOffset;
//     //   gpuPrimitive.indexType = TinyGltfWebGpu.gpuIndexFormatForComponentType(accessor.componentType);
//     //   gpuPrimitive.drawCount = accessor.count;
//     // }



//     // Store data needed to render this primitive.
//     this._primitiveGpuData.set(primitive, {
//       pipeline,
//       gpuBuffers,
//       drawCount,
//     });
//   }



//   private getShaderModule(): GPUShaderModule {
//     return new GPUShaderModule();
//   }
// }
