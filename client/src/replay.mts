import type { GameDownload } from "./board.mjs";
import { ReplayBoard } from "./replayBoard.mjs";

const FEN: string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function main() {
    const board = new ReplayBoard(FEN);

    document.addEventListener("keydown", (e) => board.keyPress(e));
    const loadingMenu: HTMLDivElement = document.getElementById("loading-menu")! as HTMLDivElement;
    const fileInput: HTMLInputElement = document.getElementById("file-input")! as HTMLInputElement;
    const controls: HTMLDivElement = document.getElementById("controls")! as HTMLDivElement;

    // Load sprites
    board.load();

    fileInput.addEventListener("change", async (e) => await fileLoaded(e, board, controls));
    fileInput.value = "";

    // Finished loading
    loadingMenu.style.display = "none";
}

async function fileLoaded(e: Event, board: ReplayBoard, controls: HTMLDivElement) {
    const wName: HTMLParagraphElement = document.getElementById("w-name")! as HTMLParagraphElement;
    const wType: HTMLParagraphElement = document.getElementById("w-type")! as HTMLParagraphElement;
    const bName: HTMLParagraphElement = document.getElementById("b-name")! as HTMLParagraphElement;
    const bType: HTMLParagraphElement = document.getElementById("b-type")! as HTMLParagraphElement;

    const target: HTMLInputElement = e.target as HTMLInputElement;
    if (
        !target.files ||
        target.files.length === 0 ||
        target.files[0]!.type != "application/json" ||
        !target.files[0]!.name.endsWith(".jupiter.json")
    ) {
        controls.style.display = "none";
        return;
    }

    controls.style.display = "grid";
    const file: File = target.files[0]!;

    const text: string = await file.text();
    const data = JSON.parse(text);

    if (
        !data.startFen ||
        !data.moves ||
        !data.whitePlayer ||
        !data.blackPlayer ||
        !data.whitePlayer.name ||
        !data.blackPlayer.name ||
        data.whitePlayer.isHuman === undefined ||
        data.blackPlayer.isHuman === undefined
    ) {
        alert(`Trying to load invalid file: ${file.name}`);
        target.value = "";
        return;
    }

    const gameDownload: GameDownload = { ...data };
    try {
        board.loadReplay(gameDownload);
    } catch (e) {
        alert(`Trying to load invalid file: ${file.name}`);
        target.value = "";
        return;
    }

    wName.innerText = gameDownload.whitePlayer.name;
    wType.innerText = gameDownload.whitePlayer.isHuman ? "Human" : "Engine";

    bName.innerText = gameDownload.blackPlayer.name;
    bType.innerText = gameDownload.blackPlayer.isHuman ? "Human" : "Engine";
}

await main();
