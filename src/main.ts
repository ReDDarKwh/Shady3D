import "./style.css";
import { Renderer } from "./renderer/renderer";
import { Node3D } from "./renderer/node3D";
import { vec3 } from "wgpu-matrix";

const renderer = (await Renderer.init());

const node1 = new Node3D();
node1.position = vec3.create(10,0,0);

const node1_1 = new Node3D();
node1_1.position = vec3.create(10,0,0);

node1.addChild(node1_1);

const node2 = new Node3D();
node2.position = vec3.create(0,0,10);

const node2_1 = new Node3D();
node2_1.position = vec3.create(0,0,10);

node2.addChild(node2_1);

renderer.addNodeToScene(node1);
renderer.addNodeToScene(node2);


