import Shader from "./common/shader";

export class BasicShader extends Shader {
  /**
   *
   */
  constructor(device: GPUDevice) {
    super(
      "Basic",
      device,
      /* wgsl */ `
      struct Uniforms {
        modelViewProjectionMatrix : mat4x4<f32>,
      }
      
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;
      
      struct VertexOutput {
        @builtin(position) Position : vec4f,
        @location(0) fragUV : vec2f,
      }
      
      @vertex
      fn vertex_main(
        @location(0) position : vec4f,
        @location(1) uv : vec2f
      ) -> VertexOutput {
        return VertexOutput(uniforms.modelViewProjectionMatrix * position, uv);
      }
      
      @fragment
      fn fragment_main(@location(0) fragUV: vec2f) -> @location(0) vec4f {
        return vec4(0.5,0,0.4,1);
      }
      `
    );
  }
}
