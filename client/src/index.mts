import { Board, timeControlLookup, type TimeControl, type TimeControlInfo } from "./board.mjs";
import { api } from "./api.mjs";
import { START_FEN } from "./fenParser.mjs";

async function main() {
    const board = new Board(START_FEN);

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

    const timeControlData: TimeControlInfo = timeControlLookup.get(timeControl)!;
    var time: number = timeControlData.time;
    var increment: number = timeControlData.increment;
    if (timeControl === "custom") {
        const minString: string = formData.get("custom-minutes")! as string;
        const secString: string = formData.get("custom-seconds")! as string;
        const incString: string = formData.get("custom-increment")! as string;

        var formTime: number = 0;
        var formIncrement: number = 0;

        if (minString.length > 0) formTime += 60 * parseInt(minString);

        if (secString.length > 0) formTime += parseInt(secString);
        else formTime += 30; // TODO: Keep this default value in line with what the ui says

        if (incString.length > 0) formIncrement = parseInt(incString);

        time = formTime;
        increment = formIncrement;
    }

    await api.gameStart(START_FEN, whitePlayer, blackPlayer, time, increment);

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
        timeControl: { time: time, increment: increment },
    });
}

await main();
