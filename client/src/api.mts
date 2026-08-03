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
}
