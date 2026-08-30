export namespace api {
    export interface EngineListResponse {
        engines: string[];
    }

    export interface BestMoveResponse {
        move_lan: string;
    }

    export async function gameStart(
        fen: string,
        white: string,
        black: string,
        time: number,
        increment: number,
    ): Promise<void> {
        await retryApiCall({
            endpoint: "/game-start/",
            method: "POST",
            body: {
                fen: fen,
                white_player: white,
                black_player: black,
                time_control: {
                    seconds: time,
                    increment: increment,
                },
            },
        });
    }

    export async function engineList(): Promise<string[]> {
        const { engines } = (await retryApiCall({
            endpoint: "/engine-list/",
            method: "GET",
        })) as EngineListResponse;
        return engines;
    }

    export async function gameOver(): Promise<void> {
        await retryApiCall({
            endpoint: "/game-over/",
            method: "GET",
        });
    }

    export async function makeMove(moveLan: string): Promise<void> {
        await retryApiCall({
            endpoint: "/make-move/",
            method: "POST",
            body: {
                move_lan: moveLan,
            },
        });
    }

    export async function bestMove(timeLeftMs: number): Promise<string> {
        const { move_lan } = (await retryApiCall({
            endpoint: "/best-move/",
            method: "POST",
            body: {
                ms_left: timeLeftMs,
            },
        })) as BestMoveResponse;
        return move_lan;
    }

    export async function startTournament(
        handler: (event: Object) => void,
        games: number,
        engine1: string,
        engine2: string,
        time: number,
        increment: number,
    ): Promise<void> {
        await streamApiCall(handler, {
            endpoint: "/start-tournament/",
            method: "POST",
            body: {
                game_count: games,
                engine_1: engine1,
                engine_2: engine2,
                time_control: {
                    seconds: time,
                    increment: increment,
                },
            },
        });
    }

    export async function stopTournament(): Promise<void> {
        await retryApiCall({
            endpoint: "/stop-tournament/",
            method: "GET",
        });
    }

    interface APICallInfo {
        endpoint: string;
        method: string;
        body?: Object;
    }

    async function retryApiCall(callInfo: APICallInfo, retries: number = 2): Promise<Object> {
        for (let i = 0; i < retries; i++) {
            const res: Object | undefined = await apiCall(callInfo);
            if (res !== undefined) return res;
        }
        throw new Error(`API call to ${callInfo.endpoint} failed after ${retries} retries`);
    }

    async function apiCall({ endpoint, method, body }: APICallInfo): Promise<Object | undefined> {
        const request: RequestInit = {
            method: method,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        };
        // Only add a body field if one is supplied
        if (body !== undefined) request.body = JSON.stringify(body);

        const url = "http://localhost:8000" + endpoint;
        return await fetch(url, request).then(async (res: Response) => {
            if (!res.ok) {
                console.error(`API Call failed to '${endpoint}'`);
                return undefined;
            }

            return await res.json();
        });
    }

    async function streamApiCall(
        handler: (event: Object) => void,
        { endpoint, method, body }: APICallInfo,
    ): Promise<void> {
        const request: RequestInit = {
            method: method,
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
            },
        };
        // Only add a body field if one is supplied
        if (body !== undefined) request.body = JSON.stringify(body);

        const url = "http://localhost:8000" + endpoint;
        await fetch(url, request).then(async (res: Response) => {
            if (!res.body) throw new Error(`No response body`);

            const reader: ReadableStreamDefaultReader = res.body.getReader();
            const decoder: TextDecoder = new TextDecoder("utf-8");
            let buffer = "";

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() || "";

                    for (const block of parts) {
                        if (!block.trim()) continue;

                        var data: string | undefined = undefined;
                        const lines = block.split("\n");
                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                data = line.replace("data: ", "");
                                break;
                            }
                        }

                        if (data) handler(JSON.parse(data));
                    }
                }
                reader.releaseLock();
            } catch (e) {
                reader.releaseLock();
                throw new Error(
                    `Streaming API call to ${endpoint} failed because:\n${(e as Error).message}`,
                );
            }
        });
    }
}
