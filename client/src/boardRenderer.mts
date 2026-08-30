import { char, type BoardState } from "./boardState.mjs";
import { Color, BoardCoordinate, Piece, pieceValid } from "./boardController.mjs";

export class BoardRenderer {
    private boardCanvas: HTMLCanvasElement;
    private spriteCanvas: HTMLCanvasElement;
    private boardCtx: CanvasRenderingContext2D;
    private spriteCtx: CanvasRenderingContext2D;
    private sprites: Map<Piece, HTMLImageElement>;

    private pieceScale: number = 0.73;
    private rookScale: number = 0.68;
    private lightSquareHex: string = "#d4c49e";
    private lightSquareHighlightHex: string = "#c35858";
    private lightSquareSeletedHex: string = "#fffd83";
    private darkSquareHex: string = "#8a6c45";
    private darkSquareHighlightHex: string = "#a34636";
    private darkSquareSelectedHex: string = "#fffd83";

    private hidden: number[] = [];
    private selected: number = -1;
    private highlighted: number[] = [];
    private flipped: boolean = false;
    private loaded: boolean = false;

    constructor(boardCanvas: HTMLCanvasElement, spriteCanvas: HTMLCanvasElement) {
        this.boardCanvas = boardCanvas;
        this.spriteCanvas = spriteCanvas;
        this.boardCtx = this.boardCanvas.getContext("2d")!;
        this.spriteCtx = this.spriteCanvas.getContext("2d")!;
        this.sprites = new Map<Piece, HTMLImageElement>();
    }

    public getCoord(x: number, y: number): BoardCoordinate {
        const raw: BoardCoordinate = new BoardCoordinate(
            Math.floor((x / this.boardCanvas.clientWidth) * 8),
            Math.floor((y / this.boardCanvas.clientHeight) * 8),
        );
        if (!this.flipped) return raw;
        return new BoardCoordinate(7, 7).sub(raw);
    }

    public async loadSprites() {
        this.sprites.set(
            Piece.PAWN,
            await this.loadSprite("./assets/sprites/b_pawn_svg_NoShadow.svg"),
        );
        this.sprites.set(
            Piece.KNIGHT,
            await this.loadSprite("./assets/sprites/b_knight_svg_NoShadow.svg"),
        );
        this.sprites.set(
            Piece.BISHOP,
            await this.loadSprite("./assets/sprites/b_bishop_svg_NoShadow.svg"),
        );
        this.sprites.set(
            Piece.ROOK,
            await this.loadSprite("./assets/sprites/b_rook_svg_NoShadow.svg"),
        );
        this.sprites.set(
            Piece.QUEEN,
            await this.loadSprite("./assets/sprites/b_queen_svg_NoShadow.svg"),
        );
        this.sprites.set(
            Piece.KING,
            await this.loadSprite("./assets/sprites/b_king_svg_NoShadow.svg"),
        );

        console.log("Sprites loaded successfully");
        this.loaded = true;
    }

    public flipBoard() {
        this.flipped = !this.flipped;
    }

    public isFlipped() {
        return this.flipped;
    }

    public setHighlighted(indices: number[]) {
        this.highlighted = indices;
    }

    public clearHighlighted() {
        this.highlighted = [];
    }

    public setSelected(index: number) {
        this.selected = index;
    }

    public clearSelected() {
        this.selected = -1;
    }

    public setHidden(indices: number[]) {
        this.hidden = indices;
    }

    public clearHidden() {
        this.hidden = [];
    }

    public drawBoard() {
        this.boardCanvas.width = this.boardCanvas.clientWidth;
        this.boardCanvas.height = this.boardCanvas.clientHeight;

        const squareSize: number = this.boardCanvas.width / 8;

        for (let r: number = 0; r < 8; r++) {
            for (let c: number = 0; c < 8; c++) {
                // Don't need to worry about flipping, board is symmetric
                const isLightSquare: boolean = (r + c) % 2 === 0;

                const x: number = c * squareSize;
                const y: number = r * squareSize;
                const index: number = this.flipped ? 63 - (r * 8 + c) : r * 8 + c;

                var lightSquareCol: string = this.lightSquareHex;
                var darkSquareCol: string = this.darkSquareHex;
                if (this.selected === index) {
                    lightSquareCol = this.lightSquareSeletedHex;
                    darkSquareCol = this.darkSquareSelectedHex;
                } else if (this.highlighted.includes(index)) {
                    lightSquareCol = this.lightSquareHighlightHex;
                    darkSquareCol = this.darkSquareHighlightHex;
                }

                // Stretch to edge if the final cell
                const width: number = c === 7 ? this.boardCanvas.width - x : squareSize;
                const height: number = r === 7 ? this.boardCanvas.height - y : squareSize;

                this.boardCtx.fillStyle = isLightSquare ? lightSquareCol : darkSquareCol;

                this.boardCtx.fillRect(x, y, width, height);

                // Letter
                const label: string = !this.flipped
                    ? char(char("A").code + c).char + (8 - r)
                    : char(char("H").code - c).char + (r + 1);

                const fontSize: number = Math.floor(squareSize * 0.15);

                this.boardCtx.font = `bold ${fontSize}px arial`;
                this.boardCtx.fillStyle = isLightSquare ? darkSquareCol : lightSquareCol; // Invert
                this.boardCtx.fillText(label, x + 3, y + fontSize);
            }
        }
    }

    public drawPieces(state: BoardState) {
        // Don't draw if not done loading yet
        if (!this.loaded) {
            console.warn("Requested sprite draw but not finished loading");
            return;
        }

        this.spriteCanvas.width = this.spriteCanvas.clientWidth;
        this.spriteCanvas.height = this.spriteCanvas.clientHeight;

        this.spriteCtx.clearRect(0, 0, this.spriteCanvas.width, this.spriteCanvas.height);

        const squareSize: number = this.spriteCanvas.width / 8;

        for (let i: number = 0; i < 64; i++) {
            const { piece, color } = state.pieces[i]!;
            if (pieceValid(piece) && !this.hidden.includes(i)) {
                const sprite: HTMLImageElement = this.sprites.get(piece)!;

                var r: number = Math.floor(i / 8);
                var c: number = i % 8;
                if (this.flipped) {
                    r = 7 - r;
                    c = 7 - c;
                }

                // The rook sprites are a little larger than I would've liked.
                const pieceScale: number = piece === Piece.ROOK ? this.rookScale : this.pieceScale;
                const pieceSize: number = squareSize * pieceScale;

                const x: number = squareSize * c + (squareSize - pieceSize) / 2;
                var y: number = squareSize * r + (squareSize - pieceSize) / 2;

                // Shift baseline of rooks down slightly to account for scale.
                if (piece === Piece.ROOK) y += squareSize * 0.02;

                // We only load black sprites and then invert colors for white to avoid loading extra
                if (color === Color.WHITE) this.spriteCtx.filter = "invert(1)";

                this.spriteCtx.drawImage(sprite, x, y, pieceSize, pieceSize);
                this.spriteCtx.filter = "none";
            }
        }
    }

    public drawPiece(piece: Piece, color: Color, x: number, y: number) {
        if (!this.loaded) {
            console.warn("Requested sprite draw but not finished loading");
            return;
        }

        const sprite = this.sprites.get(piece)!;
        const squareSize = this.spriteCanvas.width / 8;

        // The rook sprites are a little larger than I would've liked.
        const pieceScale = piece === Piece.ROOK ? this.rookScale : this.pieceScale;
        const pieceSize = squareSize * pieceScale;

        x -= pieceSize / 2;
        y -= pieceSize / 2;

        // We only load black sprites and then invert colors for white to avoid loading extra
        if (color === Color.WHITE) this.spriteCtx.filter = "invert(1)";

        this.spriteCtx.drawImage(sprite, x, y, pieceSize, pieceSize);
        this.spriteCtx.filter = "none";
    }

    public drawBoardTo(canvas: HTMLCanvasElement) {
        const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;

        if (canvas.width !== canvas.clientWidth || canvas.height != canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        const squareSize: number = canvas.width / 8;

        for (let r: number = 0; r < 8; r++) {
            for (let c: number = 0; c < 8; c++) {
                // Don't need to worry about flipping, board is symmetric
                const isLightSquare: boolean = (r + c) % 2 === 0;

                const x: number = c * squareSize;
                const y: number = r * squareSize;

                // Stretch to edge if the final cell
                const width: number = c === 7 ? canvas.width - x : squareSize;
                const height: number = r === 7 ? canvas.height - y : squareSize;

                ctx.fillStyle = isLightSquare ? this.lightSquareHex : this.darkSquareHex;
                ctx.fillRect(x, y, width, height);
            }
        }
    }

    public drawPiecesTo(canvas: HTMLCanvasElement, state: BoardState) {
        const ctx: CanvasRenderingContext2D = canvas.getContext("2d")!;

        // Don't draw if not done loading yet
        if (!this.loaded) {
            console.warn("Requested sprite draw but not finished loading");
            return;
        }

        if (canvas.width !== canvas.clientWidth || canvas.height != canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const squareSize: number = canvas.width / 8;

        for (let i: number = 0; i < 64; i++) {
            const { piece, color } = state.pieces[i]!;
            if (pieceValid(piece)) {
                const sprite: HTMLImageElement = this.sprites.get(piece)!;

                var r: number = Math.floor(i / 8);
                var c: number = i % 8;
                if (this.flipped) {
                    r = 7 - r;
                    c = 7 - c;
                }

                // The rook sprites are a little larger than I would've liked.
                const pieceScale: number = piece === Piece.ROOK ? this.rookScale : this.pieceScale;
                const pieceSize: number = squareSize * pieceScale;

                const x: number = squareSize * c + (squareSize - pieceSize) / 2;
                var y: number = squareSize * r + (squareSize - pieceSize) / 2;

                // Shift baseline of rooks down slightly to account for scale.
                if (piece === Piece.ROOK) y += squareSize * 0.02;

                // We only load black sprites and then invert colors for white to avoid loading extra
                if (color === Color.WHITE) ctx.filter = "invert(1)";

                ctx.drawImage(sprite, x, y, pieceSize, pieceSize);
                ctx.filter = "none";
            }
        }
    }

    public async animatePieceBetween(
        piece: Piece,
        color: Color,
        start: BoardCoordinate,
        end: BoardCoordinate,
        state: BoardState,
        onComplete: () => void,
    ): Promise<void> {
        if (this.flipped) {
            start = new BoardCoordinate(7, 7).sub(start);
            end = new BoardCoordinate(7, 7).sub(end);
        }

        // 150ms + 25ms per square moved
        const dx: number = Math.abs(end.x - start.x);
        const dy: number = Math.abs(end.y - start.y);
        const animationMs: number = 150 + Math.sqrt(dx * dx + dy * dy) * 25;

        const squareSize: number = this.spriteCanvas.width / 8;

        // Pixel space coordinates to move between
        const startX: number = start.x * squareSize + squareSize / 2;
        const startY: number = start.y * squareSize + squareSize / 2;

        const endX: number = end.x * squareSize + squareSize / 2;
        const endY: number = end.y * squareSize + squareSize / 2;

        // Speed at which to move
        const rateX: number = (endX - startX) / animationMs;
        const rateY: number = (endY - startY) / animationMs;

        await new Promise<void>((res, _rej) => {
            var lastTime: number = 0;
            var posX: number = startX;
            var posY: number = startY;
            const animate = (timestamp: number) => {
                if (lastTime === 0) lastTime = timestamp;

                const deltaTime: number = timestamp - lastTime;
                lastTime = timestamp;

                posX += rateX * deltaTime;
                posY += rateY * deltaTime;

                this.drawPieces(state);
                this.drawPiece(piece, color, posX, posY);

                const finishedX = endX > startX ? posX >= endX : posX <= endX;
                const finishedY = endY > startY ? posY >= endY : posY <= endY;
                finishedX && finishedY ? res() : requestAnimationFrame(animate);
            };

            requestAnimationFrame(animate);
        });

        onComplete();
    }

    private async loadSprite(url: string): Promise<HTMLImageElement> {
        // Inject missing fields for chrome
        const response: Response = await fetch(url);
        const rawSvg: string = await response.text();

        const parser: DOMParser = new DOMParser();
        const doc: Document = parser.parseFromString(rawSvg, "image/svg+xml");
        const svgElement: HTMLElement = doc.documentElement;

        const w: string = svgElement.getAttribute("width")?.replace("px", "") || "100";
        const h: string = svgElement.getAttribute("height")?.replace("px", "") || "100";

        if (!svgElement.getAttribute("viewbox")) {
            svgElement.setAttribute("viewbox", `0 0 ${w} ${h}`);
        }
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svgElement.setAttribute("width", w);
        svgElement.setAttribute("height", h);

        const serialized: string = new XMLSerializer().serializeToString(doc);
        const blob: Blob = new Blob([serialized], { type: "image/svg+xml" });
        const blobUrl: string = URL.createObjectURL(blob);

        // Load
        return new Promise((res, rej) => {
            const svg: HTMLImageElement = new Image();
            svg.onload = () => {
                // Set these for chrome
                svg.width = parseInt(w);
                svg.height = parseInt(h);
                svg.style.width = "100%";
                svg.style.height = "auto";
                svg.style.aspectRatio = `${svg.naturalWidth} / ${svg.naturalHeight}`;

                // Clean up
                URL.revokeObjectURL(blobUrl);
                res(svg);
            };
            svg.onerror = () => rej(new Error(`Failed to load svg: ${url}`));
            svg.crossOrigin = "anonymous";
            svg.src = blobUrl;
        });
    }
}
