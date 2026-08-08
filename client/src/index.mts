import { Board, timeControlLookup, type TimeControl } from "./board.mjs";
import { api } from "./api.mjs";

// TODO: Check for repetition draws
// TODO: Checkmate

const FEN: string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

async function main() {
    const board = new Board(FEN);

    // Load engines
    for (const engine of await api.engineList()) {
        for (const selectElement of [
            document.getElementById("white-player")!,
            document.getElementById("black-player")!,
        ]) {
            const option: HTMLOptionElement = document.createElement("option") as HTMLOptionElement;
            option.value = engine;
            option.innerText = engine;
            selectElement.appendChild(option);
        }
    }

    // Load sprites
    board.load();

    // Finished loading
    const loadingBlock: HTMLDivElement = document.getElementById("loading-menu")! as HTMLDivElement;
    loadingBlock.style.display = "none";

    // Game setup form
    const form: HTMLFormElement = document.getElementById("setup-game-form")! as HTMLFormElement;
    const menu: HTMLDivElement = document.getElementById("setup-game-menu")! as HTMLDivElement;
    form.addEventListener("submit", async (e) => formSubmit(e, board, menu, loadingBlock));

    board.setForm(form, menu);
}

async function formSubmit(
    e: SubmitEvent,
    board: Board,
    menu: HTMLDivElement,
    loadingBlock: HTMLDivElement,
) {
    e.preventDefault();
    loadingBlock.style.display = "flex";
    menu.style.display = "none";

    const formElement: HTMLFormElement = e.target! as HTMLFormElement;
    const formData: FormData = new FormData(formElement);

    const whitePlayer: string = formData.get("white-player")! as string;
    const blackPlayer: string = formData.get("black-player")! as string;
    const timeControl: TimeControl = formData.get("time-control")! as TimeControl;

    const { time, increment } = timeControlLookup.get(timeControl)!;
    await api.gameStart(FEN, whitePlayer, blackPlayer, time, increment);

    loadingBlock.style.display = "none";

    await board.init({
        whitePlayer: {
            name: whitePlayer,
            isHuman: whitePlayer === "Local",
        },
        blackPlayer: {
            name: blackPlayer,
            isHuman: blackPlayer === "Local",
        },
        timeControl: timeControl,
    });
}

await main();
