import "./style.css";
import { Renderer } from "./renderer/renderer";
import { Node3D } from "./renderer/node3D";
import { vec3 } from "wgpu-matrix";
import { Stats } from "./renderer/stats";

const renderer = await Renderer.init([new Stats()]);

const node1 = new Node3D();
node1.position = vec3.create(1, 2.01, 0);

const node1_1 = new Node3D();
node1_1.position = vec3.create(10, 0, 0);

node1.addChild(node1_1);

const node2 = new Node3D();
node2.position = vec3.create(0, 0, 0);

const node2_1 = new Node3D();
node2_1.position = vec3.create(0, 0, 10);

node2.addChild(node2_1);

renderer.scene.addChild(node1);
renderer.scene.addChild(node2);

const cubes: Node3D[] = [];

for (let i = 0; i < 7000; i++) {
  const node = new Node3D();
  cubes.push(node);
  renderer.scene.addChild(node);
}

let time = 0;

renderer.update = (dt) => {
  //time += dt;
  node1.rotateY(dt);

  cubes.forEach((x, i) => {
    x.position = vec3.create(
      20,
      0.01 * i,
      Math.sin(time + i / cubes.length * 20) * 5
    );
  });
};
