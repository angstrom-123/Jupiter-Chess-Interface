export class Queue<T> {
    private data: Record<number, T> = {};
    private head: number = 0;
    private tail: number = 0;

    public push(value: T) {
        this.data[this.tail++] = value;
    }

    public pop(): T | undefined {
        if (this.size() === 0) return undefined;

        const value: T | undefined = this.data[this.head];
        delete this.data[this.head];
        this.head++;
        return value;
    }

    public size(): number {
        return this.tail - this.head;
    }
}
