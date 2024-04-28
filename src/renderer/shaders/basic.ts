import Shader from "./common/shader";

export class BasicShader extends Shader {
  /**
   *
   */
  constructor(
    device: GPUDevice,
    ShaderLocations:  { [key: string]: number }
  ) {
    super(
      "Basic",
      device,
      /* wgsl */ `
      struct Uniforms {
        modelViewProjectionMatrix : mat4x4<f32>,
      }
      
      @group(0) @binding(0) var<uniform> uniforms : Uniforms;
      
      struct VertexInput {
        @location(${ShaderLocations.POSITION}) position : vec3f,
        @location(${ShaderLocations.NORMAL}) normal : vec3f,
      };
    
      struct VertexOutput {
        @builtin(position) position : vec4f,
        @location(0) normal : vec3f,
      };

      @vertex
      fn vertexMain(input : VertexInput) -> VertexOutput {
        var output : VertexOutput;

        output.position = uniforms.modelViewProjectionMatrix * vec4f(input.position, 1);
        output.normal = (vec4f(input.normal, 0)).xyz;

        return output;
      }

      // Some hardcoded lighting
      const lightDir = vec3f(0.25, 0.5, 1);
      const lightColor = vec3f(1);
      const ambientColor = vec3f(0.1);

      @fragment
      fn fragmentMain(input : VertexOutput) -> @location(0) vec4f {
        // An extremely simple directional lighting model, just to give our model some shape.
        let N = normalize(input.normal);
        let L = normalize(lightDir);
        let NDotL = max(dot(N, L), 0.0);
        let surfaceColor = ambientColor + NDotL;

        return vec4f(surfaceColor, 1);
      }


      `
    );
  }
}
