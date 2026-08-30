import { timeControlLookup, type TimeControl } from "./board.mjs";
import { api } from "./api.mjs";
import { TournamentBoard } from "./tournamentBoard.mjs";
import { START_FEN } from "./fenParser.mjs";

async function main() {
    const board: TournamentBoard = new TournamentBoard(START_FEN);

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
    await board.load();

    // Finished loading
    const loadingBlock: HTMLDivElement = document.getElementById("loading-menu")! as HTMLDivElement;
    loadingBlock.style.display = "none";

    // Game setup form
    const form: HTMLFormElement = document.getElementById(
        "setup-tournament-form",
    )! as HTMLFormElement;
    const menu: HTMLDivElement = document.getElementById(
        "setup-tournament-menu",
    )! as HTMLDivElement;
    form.addEventListener("submit", async (e) => formSubmit(e, board, menu, loadingBlock));
}

async function formSubmit(
    e: SubmitEvent,
    board: TournamentBoard,
    menu: HTMLDivElement,
    loadingBlock: HTMLDivElement,
) {
    e.preventDefault();
    loadingBlock.style.display = "flex";
    menu.style.display = "none";

    const formElement: HTMLFormElement = e.target! as HTMLFormElement;
    const formData: FormData = new FormData(formElement);

    if (!formData.has("white-player")) {
        alert("White player not specified");
        return;
    }

    if (!formData.has("black-player")) {
        alert("Black player not specified");
        return;
    }

    const games: number = parseInt(formData.get("game-count")! as string);
    const whitePlayer: string = formData.get("white-player")! as string;
    const blackPlayer: string = formData.get("black-player")! as string;
    const timeControl: TimeControl = formData.get("time-control")! as TimeControl;

    board.start(games, whitePlayer, blackPlayer, timeControlLookup.get(timeControl)!);

    loadingBlock.style.display = "none";
}

await main();
