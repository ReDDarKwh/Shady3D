import { Mat4, Vec3, mat4} from "wgpu-matrix";

export class Node3D {
  public readonly localTransform: Mat4;
  public readonly worldSpaceTransform: Mat4;

  private _parent: Node3D | undefined;
  private _children: Set<Node3D> = new Set<Node3D>();

  constructor() {
    this.worldSpaceTransform = mat4.identity();
    this.localTransform = mat4.identity();
  }

  get isRoot(){
    return this._parent == undefined;
  }

  getChildren(){
    return Array.from(this._children);
  }

  addChild(node: Node3D){
    node._parent = this;
    this._children.add(node);
    node.updateWorldTransform();
  }

  private removeChild(node: Node3D){
    this._children.add(node);
  }

  destroy(){
    this._parent!.removeChild(this);
  }


  set position(vec: Vec3){
    mat4.setTranslation(this.localTransform, vec, this.localTransform);
    this.updateWorldTransform();
  }

  get position(){
    return mat4.getTranslation(this.localTransform);
  }

  updateWorldTransform(){

    if(!this._parent){
      return;
    }

    mat4.multiply(this._parent!.worldSpaceTransform, this.localTransform, this.worldSpaceTransform);
    this._children.forEach(c => c.updateWorldTransform());
  }
}


// class Transform {
//   private _matrix = mat4.identity();

//   get matrix() {
//     return this._matrix;
//   }

//   set matrix(mat: Mat4) {
//     mat4.copy(mat, this._matrix);
//   }

//   get position() {
//     return mat4.getTranslation(this._matrix);
//   }

//   set position(vec: Vec3) {
//     mat4.setTranslation(this._matrix, vec, this._matrix);
//   }
// }


