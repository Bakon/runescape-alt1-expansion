declare interface StringMap<T> { [key: string]: T; }
declare interface NumberMap<T> { [key: number]: T; }
declare interface HTMLCanvasElement {
    captureStream(framerate?: number): MediaStream;
}