import {
    BoardController,
    Color,
    invalidPiece,
    oppositeColor,
    Piece,
    showColor,
} from "./boardController.mjs";
import { BoardRenderer } from "./boardRenderer.mjs";
import { api } from "./api.mjs";
import { Move } from "./move.mjs";
import { CountdownTimer, type TimerDisplay } from "./countdown.mjs";
import type { Square } from "./boardState.mjs";
import { humanReadableId } from "./readableId.mjs";

export const TimeControls = ["0:30", "1", "5", "10", "1+1", "5+5", "10+10"] as const;
export type TimeControl = (typeof TimeControls)[number];
export interface TimeControlInfo {
    time: number;
    increment: number;
}
export const timeControlLookup: Map<TimeControl, TimeControlInfo> = new Map<
    TimeControl,
    TimeControlInfo
>([
    ["0:30", { time: 30, increment: 0 }],
    ["1", { time: 60, increment: 0 }],
    ["5", { time: 300, increment: 0 }],
    ["10", { time: 600, increment: 0 }],
    ["1+1", { time: 60, increment: 1 }],
    ["5+5", { time: 300, increment: 5 }],
    ["10+10", { time: 600, increment: 10 }],
]);

export enum GameOverReason {
    NONE,
    TIMEOUT,
    CHECKMATE,
    STALEMATE,
    REPETITION,
    FIFTY_MOVE_RULE,
    RESIGNATION,
}

export interface PlayerInfo {
    name: string;
    isHuman: boolean;
}

export interface GameInfo {
    whitePlayer: PlayerInfo;
    blackPlayer: PlayerInfo;
    timeControl: TimeControl;
}

export interface GameDownload {
    startFen: string;
    moves: string[];
    whitePlayer: PlayerInfo;
    blackPlayer: PlayerInfo;
}

export class Board {
    private controller: BoardController;
    private renderer: BoardRenderer;

    private gameInfo: GameInfo | undefined;
    private selected: number = -1;
    private isDragging: boolean = false;
    private awaitingGameStart: boolean = false;
    private initialised: boolean = false;
    private resignConfirmActive: boolean = false;
    private isGameOver: boolean = false;

    private whiteTimer: CountdownTimer | undefined;
    private blackTimer: CountdownTimer | undefined;

    private setupForm: HTMLFormElement | undefined = undefined;
    private setupMenu: HTMLDivElement | undefined = undefined;

    private clickCover: HTMLDivElement;
    private boardCanvas: HTMLCanvasElement;
    private spriteCanvas: HTMLCanvasElement;

    private promotionMenu: HTMLDivElement;
    private knightButton: HTMLButtonElement;
    private bishopButton: HTMLButtonElement;
    private rookButton: HTMLButtonElement;
    private queenButton: HTMLButtonElement;

    private fenMenu: HTMLDivElement;
    private flipButton: HTMLButtonElement;
    private resignButton: HTMLButtonElement;
    private confirmResignSpan: HTMLSpanElement;
    private resignIcon: HTMLImageElement;
    private fenButton: HTMLButtonElement;
    private copyFenButton: HTMLButtonElement;
    private closeFenButton: HTMLButtonElement;
    private fenSpan: HTMLSpanElement;

    private gameOverMenu: HTMLDivElement;
    private gameOverSpan: HTMLSpanElement;
    private downloadGameButton: HTMLButtonElement;
    private gameOverOkButton: HTMLButtonElement;
    private gameOverCanvas: HTMLCanvasElement;
    private gameOverSpriteCanvas: HTMLCanvasElement;

    constructor(fen: string) {
        this.clickCover = document.getElementById("click-cover")! as HTMLDivElement;
        this.boardCanvas = document.getElementById("board-canvas")! as HTMLCanvasElement;
        this.spriteCanvas = document.getElementById("sprite-canvas")! as HTMLCanvasElement;

        this.spriteCanvas.addEventListener("mousedown", async (e) => await this.onMouseDown(e));
        this.spriteCanvas.addEventListener("mouseup", async (e) => await this.onMouseUp(e));
        this.spriteCanvas.addEventListener("mousemove", async (e) => await this.onMouseMove(e));

        this.promotionMenu = document.getElementById("promotion-menu")! as HTMLDivElement;
        this.knightButton = document.getElementById("promote-knight")! as HTMLButtonElement;
        this.bishopButton = document.getElementById("promote-bishop")! as HTMLButtonElement;
        this.rookButton = document.getElementById("promote-rook")! as HTMLButtonElement;
        this.queenButton = document.getElementById("promote-queen")! as HTMLButtonElement;

        this.fenMenu = document.getElementById("fen-menu")! as HTMLDivElement;
        this.flipButton = document.getElementById("flip-board")! as HTMLButtonElement;
        this.resignButton = document.getElementById("resign")! as HTMLButtonElement;
        this.confirmResignSpan = document.getElementById("confirm-resign")! as HTMLSpanElement;
        this.resignIcon = document.getElementById("resign-icon")! as HTMLImageElement;
        this.fenButton = document.getElementById("fen")! as HTMLButtonElement;
        this.copyFenButton = document.getElementById("copy-fen")! as HTMLButtonElement;
        this.closeFenButton = document.getElementById("close-fen")! as HTMLButtonElement;
        this.fenSpan = document.getElementById("fen-span")! as HTMLSpanElement;

        this.flipButton.addEventListener("click", (_e) => this.flip());
        this.resignButton.addEventListener("click", (_e) => this.resign());
        this.fenButton.addEventListener("click", (_e) => this.showFen());
        this.copyFenButton.addEventListener("click", (_e) =>
            navigator.clipboard.writeText(this.controller.getFen()),
        );
        this.closeFenButton.addEventListener("click", (_e) => {
            this.clickCover.style.display = "none";
            this.fenMenu.style.display = "none";
        });

        this.gameOverMenu = document.getElementById("game-over-menu")! as HTMLDivElement;
        this.gameOverSpan = document.getElementById("game-over-span")! as HTMLSpanElement;
        this.downloadGameButton = document.getElementById("download-game")! as HTMLButtonElement;
        this.gameOverOkButton = document.getElementById("game-over-ok")! as HTMLButtonElement;
        this.gameOverCanvas = document.getElementById("mini-board-canvas")! as HTMLCanvasElement;
        this.gameOverSpriteCanvas = document.getElementById(
            "mini-sprite-canvas",
        )! as HTMLCanvasElement;

        this.controller = new BoardController(fen);
        this.renderer = new BoardRenderer(this.boardCanvas, this.spriteCanvas);
        this.renderer.drawBoard();
    }

    public async load() {
        await this.renderer.loadSprites();
        this.renderer.drawPieces(this.controller.getState());
    }

    public async init(gameInfo: GameInfo) {
        this.gameInfo = gameInfo;

        const { time, increment } = timeControlLookup.get(this.gameInfo.timeControl)!;
        this.whiteTimer = new CountdownTimer({
            title: this.gameInfo.whitePlayer.name,
            from: time,
            increment: increment,
            display: {
                title: document.getElementById("friendly-label")! as HTMLParagraphElement,
                time: document.getElementById("friendly-timer")! as HTMLSpanElement,
                container: document.getElementById("friendly-card")! as HTMLDivElement,
            },
            onTimeout: async () => await this.gameOver(GameOverReason.TIMEOUT),
        });
        this.blackTimer = new CountdownTimer({
            title: this.gameInfo.blackPlayer.name,
            from: time,
            increment: increment,
            display: {
                title: document.getElementById("opponent-label")! as HTMLParagraphElement,
                time: document.getElementById("opponent-timer")! as HTMLSpanElement,
                container: document.getElementById("opponent-card")! as HTMLDivElement,
            },
            onTimeout: async () => await this.gameOver(GameOverReason.TIMEOUT),
        });

        this.initialised = true;

        if (this.gameInfo.whitePlayer.isHuman) {
            this.awaitingGameStart = true;
        } else {
            this.countdownTurn();
            await this.engineMove();
        }
    }

    public setForm(form: HTMLFormElement, menu: HTMLDivElement) {
        this.setupForm = form;
        this.setupMenu = menu;
    }

    private flip() {
        console.log("Flipping");

        if (!this.gameInfo) {
            console.warn("Can only flip board once game has been set up");
            return;
        }

        this.renderer.flipBoard();
        this.renderer.drawBoard();
        this.renderer.drawPieces(this.controller.getState());

        let tmp: TimerDisplay = this.whiteTimer!.getDisplay();
        this.whiteTimer!.setDisplay(this.blackTimer!.getDisplay());
        this.blackTimer!.setDisplay(tmp);
    }

    private async resign() {
        if (this.resignConfirmActive) await this.gameOver(GameOverReason.RESIGNATION);

        // Only the human can resign
        const turn = this.controller.getState().turn;
        if (turn === Color.WHITE && !this.gameInfo!.whitePlayer.isHuman) return;

        if (turn === Color.BLACK && !this.gameInfo!.blackPlayer.isHuman) return;

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

    private showFen() {
        this.fenMenu.style.display = "inline";
        this.clickCover.style.display = "inline";
        const text: string = this.controller.getFen();
        this.fenSpan.innerText = text;
    }

    private async gameOver(reason: GameOverReason) {
        this.isGameOver = true;

        this.whiteTimer!.stop();
        this.blackTimer!.stop();

        // Wait for a second so the user can register what happened
        if (reason !== GameOverReason.RESIGNATION) {
            await new Promise<void>((res, _rej) => {
                setTimeout(() => { res(); }, 1000)
            });
        }

        const winner: Color = oppositeColor(this.controller.getState().turn);
        await this.showGameOverMenu(winner, reason);

        if (!this.setupForm || !this.setupMenu)
            throw new Error("Setup form or setup menu are not assigned");

        this.initialised = false;
        this.isGameOver = false;
        this.controller = new BoardController(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        );
        if (this.renderer.isFlipped()) this.renderer.flipBoard();
        this.renderer.clearHidden();
        this.renderer.clearHighlighted();
        this.renderer.clearSelected();
        this.renderer.drawBoard();
        this.renderer.drawPieces(this.controller.getState());

        this.setupMenu.style.display = "inline";
    }

    private async showGameOverMenu(winner: Color, reason: GameOverReason): Promise<void> {
        requestAnimationFrame(() => {
            this.renderer.drawBoardTo(this.gameOverCanvas);
            this.renderer.drawPiecesTo(this.gameOverSpriteCanvas, this.controller.getState());
        });

        this.clickCover.style.display = "inline";
        this.gameOverMenu.style.display = "inline";

        switch (reason) {
            case GameOverReason.TIMEOUT:
                this.gameOverSpan.innerText = `${showColor(winner)} won by timeout`;
                break;
            case GameOverReason.CHECKMATE:
                this.gameOverSpan.innerText = `${showColor(winner)} won by checkmate`;
                break;
            case GameOverReason.STALEMATE:
                this.gameOverSpan.innerText = `Draw by stalemate`;
                break;
            case GameOverReason.REPETITION:
                this.gameOverSpan.innerText = `Draw by repetition`;
                break;
            case GameOverReason.FIFTY_MOVE_RULE:
                this.gameOverSpan.innerText = `Draw by 50-move rule`;
                break;
            case GameOverReason.RESIGNATION:
                this.gameOverSpan.innerText = `${showColor(winner)} won by resignation`;
                break;
        }

        const controller: AbortController = new AbortController();
        const { signal } = controller;

        return new Promise<void>((res, _rej) => {
            this.gameOverOkButton.addEventListener(
                "click",
                () => {
                    this.gameOverMenu.style.display = "none";
                    this.clickCover.style.display = "none";
                    controller.abort();
                    res();
                },
                { signal },
            );
            this.downloadGameButton.addEventListener(
                "click",
                () => {
                    this.downloadGame();
                    this.gameOverMenu.style.display = "none";
                    this.clickCover.style.display = "none";
                    controller.abort();
                    res();
                },
                { signal },
            );
        });
    }

    private downloadGame() {
        const game: GameDownload = {
            startFen: this.controller.getStartingFen(),
            moves: this.controller.getHistory().map((x) => x.toLan()),
            whitePlayer: this.gameInfo!.whitePlayer,
            blackPlayer: this.gameInfo!.blackPlayer,
        };

        const blob: Blob = new Blob([JSON.stringify(game)], { type: "application/json" });
        const url: string = URL.createObjectURL(blob);

        const link: HTMLAnchorElement = document.createElement("a");
        link.href = url;
        link.download = `${humanReadableId()}.jupiter.json`;
        link.click();

        URL.revokeObjectURL(url);
    }

    private gameStart() {
        this.countdownTurn();
        this.awaitingGameStart = false;
    }

    private countdownTurn() {
        if (this.controller.getState().turn === Color.WHITE) {
            this.blackTimer!.stop();
            this.whiteTimer!.start();
        } else {
            this.whiteTimer!.stop();
            this.blackTimer!.start();
        }
    }

    private async engineMove() {
        const timeMs: number =
            this.controller.getState().turn === Color.WHITE
                ? this.whiteTimer!.getMs()
                : this.blackTimer!.getMs();
        const moveLan: string = await api.bestMove(timeMs);
        const move: Move = Move.fromLan(this.controller.getState(), moveLan);

        if (!this.isGameOver) {
            this.controller.makeMove(move);
            this.renderer.drawPieces(this.controller.getState());

            const reason: GameOverReason = this.controller.isGameOver();
            if (reason !== GameOverReason.NONE) {
                await this.gameOver(reason);
                return
            }

            this.countdownTurn();

            await api.makeMove(moveLan);
            if (this.isEngineTurn()) await this.engineMove();
        }
        
    }

    private async onMouseDown(e: MouseEvent) {
        if (!this.initialised) return;
        if (this.isGameOver) return;

        if (this.awaitingGameStart) this.gameStart();

        // Check if expecting human input
        const turn: Color = this.controller.getState().turn;
        if (
            (turn === Color.WHITE && !this.gameInfo!.whitePlayer.isHuman) ||
            (turn === Color.BLACK && !this.gameInfo!.blackPlayer.isHuman)
        ) {
            this.isDragging = false;
            this.selected = -1;
            return;
        }

        const target: number = this.renderer.getCoord(e.offsetX, e.offsetY).toIndex();
        const targetSquare: Square = this.controller.getState().pieces[target]!;
        if (targetSquare.color === turn) {
            console.log(`Clicked on square at index ${target}`);

            this.selected = target;
            this.isDragging = true;
            this.renderer.setSelected(this.selected);
            this.renderer.setHidden(this.selected);
            this.renderer.setHighlighted(this.controller.getMoves(this.selected));
            this.renderer.drawBoard();
        } else if (this.selected !== -1) {
            console.log(`Clicked on target at index ${target}`);

            if (this.controller.getMoves(this.selected).includes(target)) {
                var promote: Piece = invalidPiece();
                if (this.isPromotes(target)) promote = await this.getPromotion();
                const move: Move = new Move(
                    this.controller.getState(),
                    this.selected,
                    target,
                    promote,
                );
                this.selected = -1;

                if (!this.isGameOver) {
                    this.controller.makeMove(move);

                    this.renderer.clearSelected();
                    this.renderer.clearHighlighted();
                    this.renderer.drawBoard();
                    this.renderer.drawPieces(this.controller.getState());

                    const reason: GameOverReason = this.controller.isGameOver();
                    if (reason !== GameOverReason.NONE) {
                        await this.gameOver(reason);
                        return
                    }

                    this.countdownTurn();

                    await api.makeMove(move.toLan());
                    if (this.isEngineTurn()) await this.engineMove();
                }
            } else {
                this.selected = -1;
                this.renderer.clearSelected();
                this.renderer.clearHighlighted();
                this.renderer.drawBoard();
                this.renderer.drawPieces(this.controller.getState());
            }
        }
    }

    private async onMouseUp(e: MouseEvent) {
        if (!this.initialised) return;
        if (this.isGameOver) return;

        const target: number = this.renderer.getCoord(e.offsetX, e.offsetY).toIndex();

        console.log(`Released on target at index ${target}`);

        if (this.isDragging) {
            this.isDragging = false;
            this.renderer.clearHidden();
            if (this.controller.getMoves(this.selected).includes(target)) {
                var promote: Piece = invalidPiece();
                if (this.isPromotes(target)) promote = await this.getPromotion();
                const move: Move = new Move(
                    this.controller.getState(),
                    this.selected,
                    target,
                    promote,
                );
                this.selected = -1;

                if (!this.isGameOver) {
                    this.controller.makeMove(move);

                    this.renderer.clearSelected();
                    this.renderer.clearHighlighted();
                    this.renderer.drawBoard();
                    this.renderer.drawPieces(this.controller.getState());

                    const reason: GameOverReason = this.controller.isGameOver();
                    if (reason !== GameOverReason.NONE) {
                        await this.gameOver(reason);
                        return
                    }

                    this.countdownTurn();

                    await api.makeMove(move.toLan());
                    if (this.isEngineTurn()) await this.engineMove();
                }
            }
        }
        this.renderer.drawPieces(this.controller.getState());
    }

    private isEngineTurn(): boolean {
        const turn: Color = this.controller.getState().turn;
        if (turn === Color.WHITE && this.gameInfo!.whitePlayer.isHuman) return false;

        if (turn === Color.BLACK && this.gameInfo!.blackPlayer.isHuman) return false;

        return true;
    }

    private isPromotes(target: number): boolean {
        return (
            this.selected !== -1 &&
            (target < 8 || target > 55) &&
            this.controller.getState().pieces[this.selected]!.piece === Piece.PAWN
        );
    }

    private async onMouseMove(e: MouseEvent) {
        if (!this.initialised) return;
        if (this.isGameOver) return;

        if (this.isDragging) {
            this.renderer.drawPieces(this.controller.getState());

            const square: Square = this.controller.getState().pieces[this.selected]!;
            this.renderer.drawPiece(square.piece, square.color, e.offsetX, e.offsetY);
        }
    }

    private async getPromotion() {
        this.clickCover.style.display = "inline";
        this.promotionMenu.style.display = "inline";

        const controller: AbortController = new AbortController();
        const { signal } = controller;

        return new Promise<Piece>((res, _rej) => {
            const handleChoice = (piece: Piece) => {
                this.promotionMenu.style.display = "none";
                this.clickCover.style.display = "none";
                controller.abort();
                res(piece);
            };

            this.knightButton.addEventListener("click", () => handleChoice(Piece.KNIGHT), {
                signal,
            });
            this.bishopButton.addEventListener("click", () => handleChoice(Piece.BISHOP), {
                signal,
            });
            this.rookButton.addEventListener("click", () => handleChoice(Piece.ROOK), { signal });
            this.queenButton.addEventListener("click", () => handleChoice(Piece.QUEEN), { signal });
        });
    }
}
