interface Options<T extends string> {
    tunnel?: string;
    answerTimeout?: number;
    debug?: boolean;
}
declare type id = `${`${string}::` | ""}${number}-${number}`;
declare type MaybePromise<T> = T | Promise<T>;
declare type Handler<M, R> = (message: M) => MaybePromise<R>;
export default class BetterPostMessage<Message extends any, Answer = Message | void> {
    private window;
    private handlers;
    private responders;
    private ignoreThoseProxies;
    readonly options: Options<string>;
    constructor(window: Window, options?: Options<string>);
    private debug;
    private isAnswer;
    private messageReceived;
    private deleteResponders;
    private generateID;
    private proxyfy;
    post(message: Message, custom_timeout?: number): {
        messageID: id;
        answer: Promise<Answer>;
    };
    onReceive(handler: Handler<Message, Answer>): id;
    removeHandler(id: id): boolean;
}
export {};
