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
    | "interrupt"
    | "error";
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

    private setupForm: HTMLFormElement | undefined = undefined;
    private setupMenu: HTMLDivElement | undefined = undefined;

    private winHex: string = "#35bc29";
    private drawHex: string = "#6e6e6e";
    private lossHex: string = "#ff0602";

    private colorsSwapped: boolean = false;
    private reasons: Map<GameOverReason, number> = new Map();
    private wins: number[] = [0, 0];
    private draws: number = 0;
    private tournamentRunning: boolean = false;
    private tournamentDone: boolean = false;
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

    private resignConfirmActive: boolean = false;
    private resignButton: HTMLButtonElement;
    private confirmResignSpan: HTMLSpanElement;
    private resignIcon: HTMLImageElement;

    private resultsCanvas: HTMLCanvasElement;
    private tournamentOverMenu: HTMLDivElement;
    private resultReasonSpans: Map<GameOverReason, HTMLSpanElement> = new Map();
    private resultEngine1Span: HTMLSpanElement;
    private resultEngine2Span: HTMLSpanElement;
    private downloadResultsButton: HTMLButtonElement;
    private tournamentOverOkButton: HTMLButtonElement;

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

        this.resignButton = document.getElementById("resign")! as HTMLButtonElement;
        this.confirmResignSpan = document.getElementById("confirm-resign")! as HTMLSpanElement;
        this.resignIcon = document.getElementById("resign-icon")! as HTMLImageElement;
        this.resignButton.addEventListener("click", (_e) => this.stopTournamentPressed());

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

        this.resultReasonSpans.set("checkmate", document.getElementById("checkmate-reason")!);
        this.resultReasonSpans.set("timeout", document.getElementById("timeout-reason")!);
        this.resultReasonSpans.set("stalemate", document.getElementById("stalemate-reason")!);
        this.resultReasonSpans.set("repetition", document.getElementById("repetition-reason")!);
        this.resultReasonSpans.set("material", document.getElementById("material-reason")!);
        this.resultReasonSpans.set("fifty move rule", document.getElementById("fifty-reason")!);
        this.resultReasonSpans.set("interrupt", document.getElementById("interrupt-reason")!);
        this.resultReasonSpans.set("error", document.getElementById("error-reason")!);
        this.resultEngine1Span = document.getElementById("engine-1-name")! as HTMLSpanElement;
        this.resultEngine2Span = document.getElementById("engine-2-name")! as HTMLSpanElement;
        this.resultsCanvas = document.getElementById("score-canvas")! as HTMLCanvasElement;
        this.downloadResultsButton = document.getElementById(
            "download-results",
        )! as HTMLButtonElement;
        this.tournamentOverOkButton = document.getElementById(
            "tournament-over-ok",
        )! as HTMLButtonElement;
        this.tournamentOverMenu = document.getElementById(
            "tournament-over-menu",
        )! as HTMLDivElement;
    }

    public setForm(form: HTMLFormElement, menu: HTMLDivElement) {
        this.setupForm = form;
        this.setupMenu = menu;
    }

    public async start(games: number, engine1: string, engine2: string, tc: TimeControlInfo) {
        this.whiteTimer = new CountdownTimer({
            title: engine1,
            from: tc.time,
            increment: tc.increment,
            display: {
                title: document.getElementById("friendly-label")! as HTMLParagraphElement,
                time: document.getElementById("friendly-timer")! as HTMLSpanElement,
                container: document.getElementById("friendly-card")! as HTMLDivElement,
            },
        });
        this.blackTimer = new CountdownTimer({
            title: engine2,
            from: tc.time,
            increment: tc.increment,
            display: {
                title: document.getElementById("opponent-label")! as HTMLParagraphElement,
                time: document.getElementById("opponent-timer")! as HTMLSpanElement,
                container: document.getElementById("opponent-card")! as HTMLDivElement,
            },
        });

        this.resultEngine1Span.innerText = engine1;
        this.resultEngine2Span.innerText = engine2;

        this.tournamentRunning = true;
        this.tournamentDone = false;
        setTimeout(async () => await this.pollEventQueue(), 400);

        await api.startTournament(
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
        if (!this.tournamentDone) {
            // If we are waiting for an event then poll again fast. If churning through then throttle it
            const timeoutMs: number = (queueEmpty || !this.tournamentRunning) ? 50 : 400;
            setTimeout(async () => await this.pollEventQueue(), timeoutMs);
        }
    }

    private async handleEvent(event: Object) {
        const update: TournamentUpdate = event as TournamentUpdate;
        switch (update.event) {
            case "TournamentEvent.GAME_START":
                const wasSwapped: boolean = this.colorsSwapped;
                this.colorsSwapped = update.swapped!;
                this.controller = new BoardController(START_FEN);
                this.renderer.clearHidden();
                this.renderer.clearHighlighted();
                this.renderer.clearSelected();
                this.renderer.drawBoard();
                this.renderer.drawPieces(this.controller.getState());

                // Swap the player labels if the sides changes at halftime
                if (this.colorsSwapped !== wasSwapped) {
                    let tmp: TimerDisplay = this.whiteTimer!.getDisplay();
                    this.whiteTimer!.setDisplay(this.blackTimer!.getDisplay());
                    this.blackTimer!.setDisplay(tmp);

                    if (this.controller.getState().turn === Color.WHITE) {
                        this.whiteTimer!.showBorder();
                    } else {
                        this.blackTimer!.showBorder();
                    }
                }
                break;
            case "TournamentEvent.GAME_END":
                const count: number | undefined = this.reasons.get(update.reason!);
                this.reasons.set(update.reason!, count ? count + 1 : 1);

                if (update.winner === null) {
                    this.draws++;
                    break;
                }
                const winner: Color = this.colorsSwapped
                    ? oppositeColor(update.winner)
                    : update.winner;
                this.wins[winner]!++;

                // Slight delay on game over so you can see what happened
                await new Promise<void>((res, _rej) => setTimeout(() => res(), 400));
                break;
            case "TournamentEvent.MOVE":
                // Ignore move events if we terminated the tournament
                if (!this.tournamentRunning)
                    break;

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
                // TODO Some handling?
                console.error("Some error with tournament stream");
                break;
            case "TournamentEvent.TOURNAMENT_END":
                this.tournamentRunning = false;
                this.tournamentDone = true;
                await this.showTournamentOverMenu();
                this.reset();
                break;
        }
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
        this.wins = [0, 0];
        this.draws = 0;
        this.colorsSwapped = false;
        for (const key of this.reasons.keys()) 
            this.reasons.set(key, 0);
        this.whiteTimer!.hideBorder();
        this.blackTimer!.hideBorder();
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

        let tmp: TimerDisplay = this.whiteTimer!.getDisplay();
        this.whiteTimer!.setDisplay(this.blackTimer!.getDisplay());
        this.blackTimer!.setDisplay(tmp);

        if (this.controller.getState().turn === Color.WHITE) {
            this.whiteTimer!.showBorder();
        } else {
            this.blackTimer!.showBorder();
        }
    }

    private async stopTournamentPressed() {
        if (this.resignConfirmActive) await this.stopTournament();

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

    private async stopTournament() {
        this.tournamentRunning = false;
        api.stopTournament();
    }

    private async showTournamentOverMenu(): Promise<void> {
        requestAnimationFrame(() => this.renderResultsBar());

        this.clickCover.style.display = "inline";
        this.tournamentOverMenu.style.display = "inline";

        const checkmates: number | undefined = this.reasons.get("checkmate");
        const timeouts: number | undefined = this.reasons.get("timeout");
        const stalemates: number | undefined = this.reasons.get("stalemate");
        const repetitions: number | undefined = this.reasons.get("repetition");
        const materials: number | undefined = this.reasons.get("material");
        const fifties: number | undefined = this.reasons.get("fifty move rule");
        const interrupts: number | undefined = this.reasons.get("interrupt");
        const errors: number | undefined = this.reasons.get("error");

        this.resultReasonSpans.get("checkmate")!.innerText = `${checkmates ? checkmates : "-"}`;
        this.resultReasonSpans.get("timeout")!.innerText = `${timeouts ? timeouts : "-"}`;
        this.resultReasonSpans.get("stalemate")!.innerText = `${stalemates ? stalemates : "-"}`;
        this.resultReasonSpans.get("repetition")!.innerText = `${repetitions ? repetitions : "-"}`;
        this.resultReasonSpans.get("material")!.innerText = `${materials ? materials : "-"}`;
        this.resultReasonSpans.get("fifty move rule")!.innerText = `${fifties ? fifties : "-"}`;
        this.resultReasonSpans.get("interrupt")!.innerText = `${interrupts ? interrupts : "-"}`;
        this.resultReasonSpans.get("error")!.innerText = `${errors ? errors : "-"}`;

        const controller: AbortController = new AbortController();
        const { signal } = controller;

        return new Promise<void>((res, _rej) => {
            this.tournamentOverOkButton.addEventListener(
                "click",
                () => {
                    this.tournamentOverMenu.style.display = "none";
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
                    this.tournamentOverMenu.style.display = "none";
                    this.clickCover.style.display = "none";
                    controller.abort();
                    res();
                },
                { signal },
            );
        });
    }

    private downloadResults() {
        // TODO
        // const game: GameDownload = {
        //     startFen: this.controller.getStartingFen(),
        //     moves: this.controller.getHistory().map((x) => x.toLan()),
        //     whitePlayer: this.gameInfo!.whitePlayer,
        //     blackPlayer: this.gameInfo!.blackPlayer,
        // };
        //
        // const blob: Blob = new Blob([JSON.stringify(game)], { type: "application/json" });
        // const url: string = URL.createObjectURL(blob);
        //
        // const link: HTMLAnchorElement = document.createElement("a");
        // link.href = url;
        // link.download = `${humanReadableId()}.jupiter.json`;
        // link.click();
        // URL.revokeObjectURL(url);
    }

    private renderResultsBar() {
        const ctx: CanvasRenderingContext2D = this.resultsCanvas.getContext("2d")!;

        const width: number = this.resultsCanvas.width;
        const height: number = this.resultsCanvas.height;

        // Not necessarily completed all games in tournament
        const gameCount: number = this.wins[0]! + this.wins[1]! + this.draws;

        const winWidth: number = (this.wins[0]! / gameCount) * width;
        const lossWidth: number = (this.wins[1]! / gameCount) * width;
        const drawWidth: number = width - (winWidth + lossWidth);

        ctx.fillStyle = this.winHex;
        ctx.fillRect(0, 0, winWidth, height);

        ctx.fillStyle = this.drawHex;
        ctx.fillRect(winWidth, 0, drawWidth, height);

        ctx.fillStyle = this.lossHex;
        ctx.fillRect(winWidth + drawWidth, 0, lossWidth, height);
    }
}
