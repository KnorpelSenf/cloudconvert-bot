import { Transform, TransformCallback } from 'stream'
// Stream implementation that conforms to both WriteStream and ReadStream
// and simply forwards all data
export class PassThroughStream extends Transform {
    public bytesWritten = 0
    // Hold dummy file path
    public readonly path: string = '/tmp/' + this.fileName
    // Alias close method
    public close = this.end
    public constructor(public fileName: string) {
        super()
    }
    // Simply pass through all data chunks
    public _transform(chunk: any, _: string, cb: TransformCallback): void {
        this.push(chunk)
        if (typeof chunk.length === 'number') {
            this.bytesWritten += chunk.length
        }
        setImmediate(cb)
    }
}
