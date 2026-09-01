export interface TimerDisplay {
    time: HTMLSpanElement;
    container: HTMLDivElement;
    title: HTMLParagraphElement;
}

export interface TimerInfo {
    title: string;
    from: number;
    display: TimerDisplay;
    increment?: number;
    onTimeout?: () => void;
}

export class CountdownTimer {
    private title: string;
    private countMs: number;
    private display: TimerDisplay;
    private incrementMs: number;
    private onTimeout: (() => void) | undefined;

    private isRunning: boolean = false;
    private startTime: number = 0;
    private expectedTime: number = 0;
    private intervalMs: number = 200;
    private timeout: number = 0;
    private highlightCol: string = "#17b696"; // TODO: Make sure this always matches the CSS var "accent"

    constructor({ title, from, increment, display, onTimeout }: TimerInfo) {
        this.title = title;
        this.countMs = from * 1000;
        this.incrementMs = increment ? increment * 1000 : 0;
        this.intervalMs = 100;
        this.display = display;
        this.display.time.innerText = this.formatTime();
        this.display.title.innerText = this.title;
        this.onTimeout = onTimeout;
    }

    public start() {
        this.isRunning = true;
        this.startTime = Date.now();
        this.expectedTime = this.startTime + this.intervalMs;
        this.showBorder();

        this.timeout = setTimeout(() => this.step(), this.intervalMs);
    }

    public stop() {
        this.hideBorder();
        if (this.incrementMs > 0) {
            this.countMs += this.incrementMs;
            this.display.time.innerText = this.formatTime();
        }

        this.isRunning = false;
        clearTimeout(this.timeout);
    }

    public setMs(timeMs: number) {
        this.countMs = timeMs;

        if (this.countMs > 0) this.display.time.innerText = this.formatTime();
        else this.display.time.innerText = "00:00";
    }

    public showBorder() {
        this.display.container.style.outline = `4px solid ${this.highlightCol}`;
    }

    public hideBorder() {
        this.display.container.style.outline = "none";
    }

    public getMs(): number {
        return this.countMs;
    }

    public setDisplay(display: TimerDisplay) {
        this.display = display;
        this.display.time.innerText = this.formatTime();
        this.display.title.innerText = this.title;
        this.display.container.style.outline = this.isRunning
            ? `4px solid ${this.highlightCol}`
            : "none";
    }

    public getDisplay(): TimerDisplay {
        return this.display;
    }

    private step() {
        const drift: number = Date.now() - this.expectedTime;
        if (drift > this.intervalMs) console.warn("Large timer drift detected");

        this.countMs -= this.intervalMs;
        if (this.countMs > 0) {
            this.display.time.innerText = this.formatTime();
            this.expectedTime += this.intervalMs;
            this.timeout = setTimeout(() => this.step(), this.intervalMs - drift);
        } else {
            this.display.time.innerText = "00:00";
            this.display.container.style.border = "none";
            this.countMs = 0;
            this.isRunning = false;
            if (this.onTimeout) this.onTimeout();
        }
    }

    private formatTime(): string {
        const countSeconds = this.countMs / 1000;

        var lhs: string;
        var rhs: string;

        if (countSeconds <= 60) {
            var seconds: number = Math.floor(countSeconds);
            var millis: number = parseFloat((countSeconds - seconds).toFixed(2)) * 100;

            // Make sure that it is formatted correctly if the time difference is very small
            if (millis >= 100) {
                seconds += 1;
                millis -= 100;
            }

            lhs = seconds.toString();
            rhs = millis.toFixed(0);
        } else {
            const minutes: number = Math.floor(countSeconds / 60);
            const seconds: number = Math.floor(countSeconds - minutes * 60);

            lhs = minutes.toString();
            rhs = seconds.toString();
        }

        if (rhs.length === 1) rhs = "0" + rhs;
        else if (rhs.length > 2) rhs = rhs.substring(0, 2);
        if (lhs.length === 1) lhs = "0" + lhs;

        return `${lhs}:${rhs}`;
    }
}
