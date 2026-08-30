import { api } from "./api.mjs";
import type { TimeControlInfo } from "./board.mjs";
import { BoardController, BoardCoordinate, Color, oppositeColor } from "./boardController.mjs";
import { BoardRenderer } from "./boardRenderer.mjs";
import { CountdownTimer, type TimerDisplay } from "./countdown.mjs";
import { START_FEN } from "./fenParser.mjs";
import { Move } from "./move.mjs";
import { Queue } from "./queue.mjs";

type TournamentEvent =
    | "TournamentEvent.GAME_START"
    | "TournamentEvent.GAME_END"
    | "TournamentEvent.MOVE"
    | "TournamentEvent.ERROR"
    | "TournamentEvent.TOURNAMENT_END";
type GameOverReason =
    | "timeout"
    | "checkmate"
    | "stalemate"
    | "material"
    | "repetition"
    | "fifty move rule"
    | "interrupt";
interface TournamentUpdate {
    event: TournamentEvent;
    white_ms: number | null;
    black_ms: number | null;
    move: string | null;
    winner: Color | null;
    reason: GameOverReason | null;
    swapped: boolean | null;
}

export class TournamentBoard {
    private controller: BoardController;
    private renderer: BoardRenderer;

    private whiteTimer: CountdownTimer | undefined;
    private blackTimer: CountdownTimer | undefined;

    private colorsSwapped: boolean = false;
    private reasons: Map<GameOverReason, number> = new Map();
    private wins: number[] = [0, 0];
    private draws: number = 0;
    private tournamentRunning: boolean = false;
    private eventQueue: Queue<TournamentUpdate> = new Queue();

    private clickCover: HTMLDivElement;
    private boardCanvas: HTMLCanvasElement;
    private spriteCanvas: HTMLCanvasElement;

    private flipButton: HTMLButtonElement;

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

        this.fenMenu = document.getElementById("fen-menu")! as HTMLDivElement;
        this.fenButton = document.getElementById("fen")! as HTMLButtonElement;
        this.copyFenButton = document.getElementById("copy-fen")! as HTMLButtonElement;
        this.closeFenButton = document.getElementById("close-fen")! as HTMLButtonElement;
        this.fenSpan = document.getElementById("fen-span")! as HTMLSpanElement;

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
    }

    public async start(games: number, engine1: string, engine2: string, tc: TimeControlInfo) {
        this.whiteTimer = new CountdownTimer({
            title: engine2,
            from: tc.time,
            increment: tc.increment,
            display: {
                title: document.getElementById("friendly-label")! as HTMLParagraphElement,
                time: document.getElementById("friendly-timer")! as HTMLSpanElement,
                container: document.getElementById("friendly-card")! as HTMLDivElement,
            },
        });
        this.blackTimer = new CountdownTimer({
            title: engine1,
            from: tc.time,
            increment: tc.increment,
            display: {
                title: document.getElementById("opponent-label")! as HTMLParagraphElement,
                time: document.getElementById("opponent-timer")! as HTMLSpanElement,
                container: document.getElementById("opponent-card")! as HTMLDivElement,
            },
        });

        this.tournamentRunning = true;
        setTimeout(async () => await this.pollEventQueue(), 400);

        await api.startTournament(
            // (event: Object) => this.handleEvent(event),
            (event: Object) => this.eventQueue.push(event as TournamentUpdate),
            games,
            engine1,
            engine2,
            tc.time,
            tc.increment,
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

        // Only continue polling if the tournament is not finished
        if (this.tournamentRunning) {
            // If we are waiting for an event then poll again fast. If churning through then throttle it
            const timeoutMs: number = queueEmpty ? 50 : 400;
            setTimeout(async () => await this.pollEventQueue(), timeoutMs);
        }
    }

    private async handleEvent(event: Object) {
        const update: TournamentUpdate = event as TournamentUpdate;
        switch (update.event) {
            case "TournamentEvent.GAME_START":
                console.log("w:", this.wins);
                console.log("d:", this.draws);
                console.log("r:", this.reasons);

                this.colorsSwapped = update.swapped!;
                this.controller = new BoardController(START_FEN);
                if (this.renderer.isFlipped()) this.renderer.flipBoard();
                this.renderer.clearHidden();
                this.renderer.clearHighlighted();
                this.renderer.clearSelected();
                this.renderer.drawBoard();
                this.renderer.drawPieces(this.controller.getState());
                break;
            case "TournamentEvent.GAME_END":
                if (update.winner === null) {
                    this.draws++;
                    break;
                }
                const winner: Color = this.colorsSwapped
                    ? oppositeColor(update.winner)
                    : update.winner;
                this.wins[winner]!++;

                const count: number | undefined = this.reasons.get(update.reason!);
                this.reasons.set(update.reason!, count ? count + 1 : 1);

                // Slight delay on game over to let the observer see what happened
                await new Promise<void>((res, _rej) => setTimeout(() => res(), 400));
                break;
            case "TournamentEvent.MOVE":
                const move: Move = Move.fromLan(this.controller.getState(), update.move!);
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
                );

                this.blackTimer!.setMs(update.black_ms!);
                this.whiteTimer!.setMs(update.white_ms!);

                if (this.controller.getState().turn === Color.WHITE) {
                    this.blackTimer!.hideBorder();
                    this.whiteTimer!.showBorder();
                } else {
                    this.whiteTimer!.hideBorder();
                    this.blackTimer!.showBorder();
                }
                break;
            case "TournamentEvent.ERROR":
                console.error("Some error with tournament stream");
                break;
            case "TournamentEvent.TOURNAMENT_END":
                this.tournamentRunning = false;
                break;
        }
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

        let tmp: TimerDisplay = this.whiteTimer!.getDisplay();
        this.whiteTimer!.setDisplay(this.blackTimer!.getDisplay());
        this.blackTimer!.setDisplay(tmp);

        if (this.controller.getState().turn === Color.WHITE) {
            this.whiteTimer!.showBorder();
        } else {
            this.blackTimer!.showBorder();
        }
    }
}
