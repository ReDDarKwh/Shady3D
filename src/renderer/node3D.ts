import { Mat4, Vec3, mat4} from "wgpu-matrix";

export class Node3D {
  public readonly localTransform: Mat4;
  public readonly worldSpaceTransform: Mat4;

  static currentNum : number = 0; 

  private _parent: Node3D | undefined;
  private _childIndexes: Map<number, number> = new Map<number, number>();
  private _children: Node3D[] = [];
  private _availableChildArrayIndexed : number[] = [];

  private _id : number;

  constructor() {
    this.worldSpaceTransform = mat4.identity();
    this.localTransform = mat4.identity();
    this._id = Node3D.currentNum ++;
  }

  get isRoot(){
    return this._parent == undefined;
  }

  getChildren(){
    return this._children.values();
  }

  addChild(node: Node3D){
    node._parent = this;
    this._children.set(this._id, node);
    node.updateWorldTransform();
  }

  private removeChild(id: number){
    this._children.delete(id);
  }

  destroy(){
    this._parent!.removeChild(this._id);
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


