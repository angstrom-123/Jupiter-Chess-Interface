import { api } from "./api.mjs";
import { BoardController, BoardCoordinate } from "./boardController.mjs";
import { BoardRenderer } from "./boardRenderer.mjs";
import { START_FEN } from "./fenParser.mjs";
import { Move } from "./move.mjs";
import { Queue } from "./queue.mjs";
import { humanReadableId } from "./readableId.mjs";
import type { TournamentUpdate } from "./tournamentBoard.mjs";

type TunerEvent =
    | "SPSAEvent.ERROR"
    | "SPSAEvent.PARAMS_UPDATE"
    | "SPSAEvent.TUNING_DONE"
    | "SPSAEvent.TOURNAMENT_UPDATE";
interface TunerUpdate {
    event: TunerEvent;
    tournament_update: TournamentUpdate | null;
    params: Object | null;
}

export class TuningBoard {
    private controller: BoardController;
    private renderer: BoardRenderer;

    private params: Object | undefined = undefined;
    private iterations: number = 0;
    private iteration: number = 0;

    private engineSpan: HTMLSpanElement;
    private iterationSpan: HTMLSpanElement;
    private cSpan: HTMLSpanElement;
    private smallestChangeSpan: HTMLSpanElement;

    private setupForm: HTMLFormElement | undefined = undefined;
    private setupMenu: HTMLDivElement | undefined = undefined;

    private tuningRunning: boolean = false;
    private tuningDone: boolean = false;
    private eventQueue: Queue<TunerUpdate> = new Queue();

    private clickCover: HTMLDivElement;
    private boardCanvas: HTMLCanvasElement;
    private spriteCanvas: HTMLCanvasElement;

    private flipButton: HTMLButtonElement;

    private fenMenu: HTMLDivElement;
    private fenButton: HTMLButtonElement;
    private copyFenButton: HTMLButtonElement;
    private closeFenButton: HTMLButtonElement;
    private fenSpan: HTMLSpanElement;

    private paramContainer: HTMLDivElement;
    private finalParamContainer: HTMLDivElement;

    private resignConfirmActive: boolean = false;
    private resignButton: HTMLButtonElement;
    private confirmResignSpan: HTMLSpanElement;
    private resignIcon: HTMLImageElement;

    private tuningOverMenu: HTMLDivElement;
    private tuningOverOkButton: HTMLButtonElement;
    private tuningOverLoadingMenu: HTMLDivElement;
    private downloadResultsButton: HTMLButtonElement;

    constructor(fen: string) {
        this.clickCover = document.getElementById("click-cover")! as HTMLDivElement;
        this.boardCanvas = document.getElementById("board-canvas")! as HTMLCanvasElement;
        this.spriteCanvas = document.getElementById("sprite-canvas")! as HTMLCanvasElement;

        this.flipButton = document.getElementById("flip-board")! as HTMLButtonElement;

        this.fenMenu = document.getElementById("fen-menu")! as HTMLDivElement;
        this.fenButton = document.getElementById("fen")! as HTMLButtonElement;
        this.copyFenButton = document.getElementById("copy-fen")! as HTMLButtonElement;
        this.closeFenButton = document.getElementById("close-fen")! as HTMLButtonElement;
        this.fenSpan = document.getElementById("fen-span")! as HTMLSpanElement;

        this.paramContainer = document.getElementById("param-container")! as HTMLDivElement;
        this.finalParamContainer = document.getElementById(
            "final-param-container",
        )! as HTMLDivElement;

        this.resignButton = document.getElementById("resign")! as HTMLButtonElement;
        this.confirmResignSpan = document.getElementById("confirm-resign")! as HTMLSpanElement;
        this.resignIcon = document.getElementById("resign-icon")! as HTMLImageElement;
        this.resignButton.addEventListener("click", (_e) => this.stopTuningPressed());

        this.controller = new BoardController(fen);
        this.renderer = new BoardRenderer(this.boardCanvas, this.spriteCanvas);

        this.renderer.drawBoard();

        this.flipButton.addEventListener("click", (_e) => this.flip());

        this.fenButton.addEventListener("click", (_e) => this.showFen());
        this.copyFenButton.addEventListener("click", (_e) =>
            navigator.clipboard.writeText(this.controller.getFen()),
        );
        this.closeFenButton.addEventListener("click", (_e) => {
            this.clickCover.style.display = "none";
            this.fenMenu.style.display = "none";
        });

        this.tuningOverOkButton = document.getElementById("tuning-over-ok")! as HTMLButtonElement;
        this.tuningOverMenu = document.getElementById("tuning-over-menu")! as HTMLDivElement;
        this.tuningOverLoadingMenu = document.getElementById(
            "tuning-loading-menu",
        )! as HTMLDivElement;
        this.downloadResultsButton = document.getElementById(
            "download-results",
        )! as HTMLButtonElement;

        this.engineSpan = document.getElementById("engine-span")! as HTMLSpanElement;
        this.iterationSpan = document.getElementById("iteration-span")! as HTMLSpanElement;
        this.cSpan = document.getElementById("c-span")! as HTMLSpanElement;
        this.smallestChangeSpan = document.getElementById(
            "smallest-change-span",
        )! as HTMLSpanElement;
    }

    public setForm(form: HTMLFormElement, menu: HTMLDivElement) {
        this.setupForm = form;
        this.setupMenu = menu;
    }

    public async start(
        iterations: number,
        engine: string,
        c: number | undefined,
        smallest_change: number | undefined,
    ) {
        this.tuningRunning = true;
        this.tuningDone = false;
        setTimeout(async () => await this.pollEventQueue(), 200);

        this.engineSpan.innerHTML = engine;
        this.iterations = iterations;
        this.iteration = 0;
        this.iterationSpan.innerHTML = `${this.iteration}/${this.iterations}`;
        this.cSpan.innerHTML = String(c ? c : 0.05);
        this.smallestChangeSpan.innerHTML = String(smallest_change ? smallest_change : 0.05);

        await api.startTuning(
            (event: Object) => this.eventQueue.push(event as TunerUpdate),
            iterations,
            engine,
            c,
            smallest_change,
        );
    }

    public async load() {
        await this.renderer.loadSprites();
        this.renderer.drawPieces(this.controller.getState());
    }

    private async pollEventQueue() {
        // Skip this poll if our queue is empty
        const queueEmpty: boolean = this.eventQueue.size() == 0;
        if (!queueEmpty) await this.handleEvent(this.eventQueue.pop()!);

        // Only continue polling if the tuning is not finished
        if (!this.tuningDone) {
            var timeoutMs: number = 200;
            if (queueEmpty) {
                timeoutMs = 50; // Wait a bit before polling the queue again
            } else if (!this.tuningRunning) {
                this.pollEventQueue(); // Poll immediately if events in queue but tuning over
                return;
            }
            setTimeout(async () => await this.pollEventQueue(), timeoutMs);
        }
    }

    private async handleEvent(event: Object) {
        const update: TunerUpdate = event as TunerUpdate;
        switch (update.event) {
            case "SPSAEvent.TUNING_DONE":
                this.tuningRunning = false;
                this.tuningDone = true;
                await this.showTuningOverMenu();
                this.reset();
                break;

            case "SPSAEvent.PARAMS_UPDATE":
                this.iteration++;
                this.iterationSpan.innerHTML = `${this.iteration}/${this.iterations}`;

                const firstUpdate: boolean = this.params === undefined;
                this.params = update.params!;
                if (firstUpdate) {
                    Object.entries(this.params).forEach(([k, v]) => {
                        const val: string = Number(v).toFixed(3);

                        const entry: HTMLDivElement = this.createParamEntry(k, val, "-");
                        this.paramContainer.appendChild(entry);

                        const finalEntry: HTMLDivElement = this.createFinalParamEntry(k, val);
                        this.finalParamContainer.appendChild(finalEntry);
                    });
                } else {
                    Object.entries(this.params).forEach(([k, v]) => {
                        const val: string = Number(v).toFixed(3);

                        var value: HTMLLabelElement = document.getElementById(
                            `${k}-value`,
                        )! as HTMLLabelElement;
                        var previous: HTMLLabelElement = document.getElementById(
                            `${k}-previous`,
                        )! as HTMLLabelElement;
                        previous.innerHTML = value.innerHTML;
                        value.innerHTML = val;

                        var finalValue: HTMLLabelElement = document.getElementById(
                            `${k}-final-value`,
                        )! as HTMLLabelElement;
                        finalValue.innerHTML = val;
                    });
                }
                break;
            case "SPSAEvent.ERROR":
                // TODO: Some error handling?
                console.error("Some error with tuning stream");
                break;

            case "SPSAEvent.TOURNAMENT_UPDATE":
                switch (update.tournament_update!.event) {
                    case "TournamentEvent.GAME_START":
                        this.controller = new BoardController(START_FEN);
                        this.renderer.clearHidden();
                        this.renderer.clearHighlighted();
                        this.renderer.clearSelected();
                        this.renderer.drawBoard();
                        this.renderer.drawPieces(this.controller.getState());
                        break;
                    case "TournamentEvent.MOVE":
                        console.log(`Received move: '${update.tournament_update!.move!}'`);

                        // Ignore move events if we terminated the tuning
                        if (!this.tuningRunning) break;

                        const move: Move = Move.fromLan(
                            this.controller.getState(),
                            update.tournament_update!.move!,
                        );
                        this.controller.makeMove(move);
                        this.renderer.setHidden([move.from, move.to]);
                        this.renderer.animatePieceBetween(
                            move.piece,
                            move.color,
                            BoardCoordinate.fromIndex(move.from),
                            BoardCoordinate.fromIndex(move.to),
                            this.controller.getState(),
                            () => {
                                this.renderer.clearHidden();
                                this.renderer.drawPieces(this.controller.getState());
                            },
                            2.0,
                        );
                        break;
                    case "TournamentEvent.ERROR":
                        // TODO Some handling?
                        console.error("Some error with tuning stream");
                        break;
                    case "TournamentEvent.GAME_END":
                        break;
                    case "TournamentEvent.TOURNAMENT_END":
                        break;
                }
        }
    }

    private createParamEntry(name: string, value: string, previous: string): HTMLDivElement {
        const container: HTMLDivElement = document.createElement("div");
        container.setAttribute("id", `${name}-container`);

        const nameLabel: HTMLLabelElement = document.createElement("label");
        nameLabel.setAttribute("id", `${name}-name`);
        nameLabel.innerHTML = name;

        const valueLabel: HTMLLabelElement = document.createElement("label");
        valueLabel.setAttribute("id", `${name}-value`);
        valueLabel.innerHTML = value;

        const previousLabel: HTMLLabelElement = document.createElement("label");
        previousLabel.setAttribute("id", `${name}-previous`);
        previousLabel.innerHTML = previous;

        container.appendChild(nameLabel);
        container.appendChild(valueLabel);
        container.appendChild(previousLabel);

        return container;
    }

    private createFinalParamEntry(name: string, value: string): HTMLDivElement {
        const container: HTMLDivElement = document.createElement("div");
        container.setAttribute("id", `${name}-final-container`);

        const nameLabel: HTMLLabelElement = document.createElement("label");
        nameLabel.setAttribute("id", `${name}-final-name`);
        nameLabel.innerHTML = name;

        const previousLabel: HTMLLabelElement = document.createElement("label");

        const valueLabel: HTMLLabelElement = document.createElement("label");
        valueLabel.setAttribute("id", `${name}-final-value`);
        valueLabel.innerHTML = value;

        container.appendChild(nameLabel);
        container.appendChild(previousLabel);
        container.appendChild(valueLabel);

        return container;
    }

    private reset() {
        if (!this.setupForm || !this.setupMenu)
            throw new Error("Setup form or setup menu are not assigned");

        this.eventQueue = new Queue();
        this.controller = new BoardController(START_FEN);
        if (this.renderer.isFlipped()) this.renderer.flipBoard();
        this.renderer.clearHidden();
        this.renderer.clearHighlighted();
        this.renderer.clearSelected();
        this.renderer.drawBoard();
        this.renderer.drawPieces(this.controller.getState());
        this.setupMenu.style.display = "inline";
    }

    private showFen() {
        this.fenMenu.style.display = "inline";
        this.clickCover.style.display = "inline";
        const text: string = this.controller.getFen();
        this.fenSpan.innerText = text;
    }

    private flip() {
        this.renderer.flipBoard();
        this.renderer.drawBoard();
        this.renderer.drawPieces(this.controller.getState());
    }

    private async stopTuningPressed() {
        if (this.resignConfirmActive) await this.stopTuning();

        // Confirm
        this.resignIcon.style.display = "none";
        this.confirmResignSpan.innerText = "ok?";

        this.resignConfirmActive = true;
        setTimeout(() => {
            this.resignIcon.style.display = "inline";
            this.confirmResignSpan.innerText = "";
            this.resignConfirmActive = false;
        }, 2000);
    }

    private async stopTuning() {
        this.tuningOverLoadingMenu.style.display = "flex";
        this.tuningRunning = false;
        api.stopTuning();
    }

    private downloadResults() {
        const blob: Blob = new Blob([JSON.stringify(this.params)], { type: "application/json" });
        const url: string = URL.createObjectURL(blob);

        const link: HTMLAnchorElement = document.createElement("a");
        link.href = url;
        link.download = `${this.engineSpan.innerHTML}-params-${humanReadableId()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    private async showTuningOverMenu(): Promise<void> {
        this.clickCover.style.display = "inline";
        this.tuningOverLoadingMenu.style.display = "none";
        this.tuningOverMenu.style.display = "inline";

        const controller: AbortController = new AbortController();
        const { signal } = controller;

        return new Promise<void>((res, _rej) => {
            this.tuningOverOkButton.addEventListener(
                "click",
                () => {
                    this.tuningOverMenu.style.display = "none";
                    this.clickCover.style.display = "none";
                    controller.abort();
                    res();
                },
                { signal },
            );
            this.downloadResultsButton.addEventListener(
                "click",
                () => {
                    this.downloadResults();
                    this.tuningOverMenu.style.display = "none";
                    this.clickCover.style.display = "none";
                    controller.abort();
                    res();
                },
                { signal },
            );
        });
    }
}
