export type Image = { data: Uint8ClampedArray; width: number; height: number }
export type Pixel = [number, number, number, number]

export type DetectedLine = { rho: number; theta: number; votes: number }
export type Component = {
  id: number
  area: number
  centroid: { x: number; y: number }
  bbox: { x: number; y: number; w: number; h: number }
}
export type ComponentResult = { labels: Int32Array; width: number; height: number; components: Component[] }
