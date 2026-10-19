export interface Point {
  x: number;
  y: number;
}
export interface Vertex extends Point {
  in: Point | null;
  out: Point | null;
}
export interface Contour {
  points: Vertex[];
  closed: boolean;
}
