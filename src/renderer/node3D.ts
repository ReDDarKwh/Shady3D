import { Mat4, Vec3, mat4 } from "wgpu-matrix";

export class Node3D {
  private _localTransform: Mat4;
  private _worldSpaceTransform: Mat4;

  private _parent?: Node3D;
  private _children: Set<Node3D> = new Set<Node3D>();

  private _hasPendingWorldSpaceUpdate = false;

  constructor() {
    this._worldSpaceTransform = mat4.identity();
    this._localTransform = mat4.identity();
  }

  get isRoot() {
    return this._parent == undefined;
  }

  *getChildren(): IterableIterator<Node3D> {
    if (!this.isRoot) {
      yield this;
    }
    for (let n of this._children.values()) {
      yield* n.getChildren();
    }
  }

  addChild(node: Node3D) {
    node._parent = this;
    this._children.add(node);
    node.requestWorldTransformUpdate();
  }

  private removeChild(node: Node3D) {
    this._children.delete(node);
  }

  destroy() {
    this._parent!.removeChild(this);
  }

  rotateY(rad: number){
    mat4.rotateY(this._localTransform, rad, this._localTransform);
    this.requestWorldTransformUpdate();
  }

  set position(vec: Vec3) {
    mat4.setTranslation(this._localTransform, vec, this._localTransform);
    this.requestWorldTransformUpdate();
  }

  get position() {
    return mat4.getTranslation(this._localTransform);
  }

  get worldSpaceTransform(){

    if(this._hasPendingWorldSpaceUpdate){

      let p : Node3D | undefined = this;

      while(p._parent?._hasPendingWorldSpaceUpdate){
        p = p?._parent;
      }

      p.updateWorldTransform();
    } 

    return this._worldSpaceTransform;
  }

  requestWorldTransformUpdate() {
    this._hasPendingWorldSpaceUpdate = true;
    this._children.forEach((c) => c.requestWorldTransformUpdate());
  }

  updateWorldTransform(){

    this._hasPendingWorldSpaceUpdate = false;

    mat4.multiply(
      this._parent!._worldSpaceTransform,
      this._localTransform,
      this._worldSpaceTransform
    );

    this._children.forEach((c) => c.updateWorldTransform());
  }

}
