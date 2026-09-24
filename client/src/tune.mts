import { api } from "./api.mjs";
import { START_FEN } from "./fenParser.mjs";
import { TuningBoard } from "./tuningBoard.mjs";

async function main() {
    const board: TuningBoard = new TuningBoard(START_FEN);

    // Load engines
    for (const engine of await api.tunableEngineList()) {
        const element: HTMLSelectElement = document.getElementById("engine")! as HTMLSelectElement;
        const option: HTMLOptionElement = document.createElement("option") as HTMLOptionElement;
        option.value = engine;
        option.innerText = engine;
        element.appendChild(option);
    }

    // Load sprites
    await board.load();

    // Finished loading
    const loadingBlock: HTMLDivElement = document.getElementById("loading-menu")! as HTMLDivElement;
    loadingBlock.style.display = "none";

    // Game setup form
    const form: HTMLFormElement = document.getElementById("setup-tuning-form")! as HTMLFormElement;
    const menu: HTMLDivElement = document.getElementById("setup-tuning-menu")! as HTMLDivElement;
    form.addEventListener("submit", async (e) => formSubmit(e, board, menu, loadingBlock));

    board.setForm(form, menu);
}

async function formSubmit(
    e: SubmitEvent,
    board: TuningBoard,
    menu: HTMLDivElement,
    loadingBlock: HTMLDivElement,
) {
    e.preventDefault();
    loadingBlock.style.display = "flex";
    menu.style.display = "none";

    const formElement: HTMLFormElement = e.target! as HTMLFormElement;
    const formData: FormData = new FormData(formElement);

    const iterations: number = parseInt(formData.get("iterations")! as string);
    const engine: string = formData.get("engine")! as string;

    const cString: string | undefined = formData.get("c")?.toString();
    const smallestChangeString: string | undefined = formData.get("smallest-change")?.toString();
    const c: number | undefined = cString !== undefined ? parseFloat(cString) : undefined;
    const smallestChange: number | undefined =
        smallestChangeString !== undefined ? parseFloat(smallestChangeString) : undefined;

    board.start(iterations, engine, c, smallestChange);

    loadingBlock.style.display = "none";
}

await main();
