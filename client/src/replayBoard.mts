import type { GameDownload } from "./board.mjs";
import { BoardController } from "./boardController.mjs";
import { BoardRenderer } from "./boardRenderer.mjs";
import { Move, type MoveData } from "./move.mjs";

export class ReplayBoard {
    private replay: GameDownload | undefined = undefined;
    private replayStep: number = 0;
    private unmakeHistory: MoveData[] = [];
    private controller: BoardController;
    private renderer: BoardRenderer;

    private clickCover: HTMLDivElement;
    private boardCanvas: HTMLCanvasElement;
    private spriteCanvas: HTMLCanvasElement;

    private flipButton: HTMLButtonElement;
    private stepForwardButton: HTMLButtonElement;
    private stepBackButton: HTMLButtonElement;
    private skipForwardButton: HTMLButtonElement;
    private skipBackButton: HTMLButtonElement;

    private fenMenu: HTMLDivElement;
    private fenButton: HTMLButtonElement;
    private copyFenButton: HTMLButtonElement;
    private closeFenButton: HTMLButtonElement;
    private fenSpan: HTMLSpanElement;

    constructor(fen: string) {
        this.clickCover = document.getElementById("click-cover")! as HTMLDivElement;
        this.boardCanvas = document.getElementById("board-canvas")! as HTMLCanvasElement;
        this.spriteCanvas = document.getElementById("sprite-canvas")! as HTMLCanvasElement;

        this.flipButton = document.getElementById("flip-board")! as HTMLButtonElement;
        this.stepForwardButton = document.getElementById("step-forward")! as HTMLButtonElement;
        this.stepBackButton = document.getElementById("step-back")! as HTMLButtonElement;
        this.skipForwardButton = document.getElementById("to-end")! as HTMLButtonElement;
        this.skipBackButton = document.getElementById("to-start")! as HTMLButtonElement;

        this.fenMenu = document.getElementById("fen-menu")! as HTMLDivElement;
        this.fenButton = document.getElementById("fen")! as HTMLButtonElement;
        this.copyFenButton = document.getElementById("copy-fen")! as HTMLButtonElement;
        this.closeFenButton = document.getElementById("close-fen")! as HTMLButtonElement;
        this.fenSpan = document.getElementById("fen-span")! as HTMLSpanElement;

        this.controller = new BoardController(fen);
        this.renderer = new BoardRenderer(this.boardCanvas, this.spriteCanvas);

        this.renderer.drawBoard();

        this.flipButton.addEventListener("click", (_e) => this.flip());
        this.stepForwardButton.addEventListener("click", (_e) => this.stepForward());
        this.stepBackButton.addEventListener("click", (_e) => this.stepBack());
        this.skipForwardButton.addEventListener("click", (_e) => this.skipForward());
        this.skipBackButton.addEventListener("click", (_e) => this.skipBack());

        this.fenButton.addEventListener("click", (_e) => this.showFen());
        this.copyFenButton.addEventListener("click", (_e) =>
            navigator.clipboard.writeText(this.controller.getFen()),
        );
        this.closeFenButton.addEventListener("click", (_e) => {
            this.clickCover.style.display = "none";
            this.fenMenu.style.display = "none";
        });
    }

    public keyPress(e: KeyboardEvent) {
        switch (e.code) {
            case "ArrowLeft":
                this.stepBack();
                break;
            case "ArrowRight":
                this.stepForward();
                break;
        }
    }

    public async load() {
        await this.renderer.loadSprites();
        this.renderer.drawPieces(this.controller.getState());
    }

    public async loadReplay(replay: GameDownload) {
        this.replayStep = 0;
        this.replay = replay;
        this.unmakeHistory = [];
        this.controller = new BoardController(replay.startFen);
        this.renderer.drawPieces(this.controller.getState());
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

    private stepForward() {
        if (!this.replay || this.replayStep >= this.replay.moves.length) return;

        const lan: string = this.replay.moves[this.replayStep++]!;
        const move: Move = Move.fromLan(this.controller.getState(), lan);
        const moveData: MoveData = this.controller.makeMove(move);
        this.unmakeHistory.push(moveData);
        this.renderer.drawPieces(this.controller.getState());
    }

    private stepBack() {
        if (!this.replay || this.replayStep <= 0) return;

        const unmake: MoveData = this.unmakeHistory.pop()!;
        this.controller.unmakeMove(unmake);
        this.replayStep--;
        this.renderer.drawPieces(this.controller.getState());
    }

    private skipForward() {
        if (!this.replay || this.replayStep >= this.replay.moves.length) return;

        while (this.replayStep < this.replay.moves.length) {
            const lan: string = this.replay.moves[this.replayStep++]!;
            const move: Move = Move.fromLan(this.controller.getState(), lan);
            const moveData: MoveData = this.controller.makeMove(move);
            this.unmakeHistory.push(moveData);
        }
        this.renderer.drawPieces(this.controller.getState());
    }

    private skipBack() {
        if (!this.replay || this.replayStep <= 0) return;

        while (this.unmakeHistory.length > 0) {
            const unmake: MoveData = this.unmakeHistory.pop()!;
            this.controller.unmakeMove(unmake);
            this.replayStep--;
        }
        this.renderer.drawPieces(this.controller.getState());
    }
}
