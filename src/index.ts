interface Options<T extends string> {
	/**
	 * Specify the custom tunnel of the proxy. Handler and message will be only receive/send to this tunnel.
	 * Of omited, it will receive and send to all tunnels (note that tunneled proxy will not receive message from global tunnels).
	 * ! Note that a tunnel cannot contain character ':'.
	 */
	tunnel?: string;
	/**
	 * In milliseconds, the default maximum amount of time a message can wait for its answer.
	 * @default {15_000}
	 */
	answerTimeout?: number;
	/**
	 * Activate the log messages (in the debug console)
	 */
	debug?: boolean;
}
type id = `${`${string}::` | ""}${number}-${number}`;
type ProxyMessage<M, A = M> = {
	__BETTER_POST_MESSAGE: true;
	id: id;
	tunnel?: string;
} & (
	| {
			data: M;
	  }
	| {
			init_proxy: id;
			data: A;
	  }
);

type MaybePromise<T> = T | Promise<T>;
type Handler<M, R> = (message: M) => MaybePromise<R>;

export default class BetterPostMessage<
	Message extends any,
	Answer = Message | void
> {
	private handlers: { id: id; handler: Handler<Message, Answer> }[] = [];
	private responders: {
		proxyID: id;
		promiseResponder: (res: Answer | PromiseLike<Answer>) => void;
	}[] = [];
	private ignoreThoseProxies: id[] = [];
	readonly options: Options<string>;

	constructor(private window: Window, options?: Options<string>) {
		if (options?.tunnel?.includes(":"))
			throw new Error(
				"Invalid tunnel name (note that tunnel cannot contain the character ':')."
			);
		this.options = options || {};

		window.addEventListener("message", ({ data }) => {
			if (
				typeof data === "object" &&
				"__BETTER_POST_MESSAGE" in data &&
				data.__BETTER_POST_MESSAGE
			)
				this.messageReceived(data as ProxyMessage<Message, Answer>);
		});
		this.debug("Instance created. TUNNEL =", options?.tunnel || "<GLOBAL>");
	}

	private debug(...message: any[]) {
		if (!this.options.debug) return;
		console.debug(
			`[BetterPostMessage${
				this.options.tunnel ? ` - ${this.options.tunnel}` : ""
			}]>`,
			...message
		);
	}

	private isAnswer(
		proxy: ProxyMessage<Message | Answer>
	): proxy is ProxyMessage<Answer> {
		return !!("init_proxy" in proxy && proxy.init_proxy);
	}

	private messageReceived(proxy: ProxyMessage<Message, Answer>) {
		//* The next 4 lines are here to prevent handling message sent from this context
		const ignoredIndex = this.ignoreThoseProxies.indexOf(proxy.id);
		if (ignoredIndex >= 0) {
			this.ignoreThoseProxies.splice(ignoredIndex, 1);
			return;
		}

		if (
			this.options.tunnel &&
			proxy.tunnel &&
			this.options.tunnel !== proxy.tunnel
		)
			return this.debug(
				`Blocked proxy from tunnel ${proxy.tunnel} because it doesn't match this tunnel (${this.options.tunnel}).`
			);

		if (this.isAnswer(proxy)) {
			const responders = this.responders.filter(
				(resp) => resp.proxyID === proxy.init_proxy
			);
			if (responders.length) {
				this.debug(
					"Received answer <",
					proxy.id,
					"> from proxy <",
					proxy.init_proxy,
					">.",
					responders.length,
					"message promises will be resolved. Answer content: ",
					proxy.data
				);
				this.deleteResponders(proxy.init_proxy);

				responders.forEach((r) => r.promiseResponder(proxy.data));
			} else
				this.debug(
					"Answer message received but no responders found for it.",
					proxy,
					this.responders
				);
		} else {
			this.debug(
				"Received message from proxy <",
				proxy.id,
				">.",
				this.handlers.length,
				"handlers will be triggered. Message content: ",
				proxy.data
			);
			this.handlers.forEach(async ({ handler, id: handlerID }) => {
				const answer = await handler(proxy.data);
				if (typeof answer === "undefined") return;

				const answerProxy = this.proxyfy(answer, undefined, proxy.id);
				this.window.postMessage(answerProxy);
				this.debug(
					"Handler <",
					handlerID,
					"> has answered to the message <",
					proxy.id,
					"> with content :",
					answer
				);
			});
		}
	}
	private deleteResponders(proxyID: id) {
		this.responders = this.responders.filter(
			(resp) => resp.proxyID !== proxyID
		);
		this.debug("Deleted all responders for proxy <", proxyID, ">.");
	}
	private generateID() {
		const { tunnel } = this.options;
		return ((tunnel ? `${tunnel}::` : "") +
			`${Date.now()}-${Math.floor(Math.random() * 1000)}`) as id;
	}
	private proxyfy<D extends Message | Answer>(
		data: D,
		id?: id,
		fromProxy?: id
	): ProxyMessage<D> {
		return {
			__BETTER_POST_MESSAGE: true,
			id: id || this.generateID(),
			data,
			tunnel: this.options.tunnel,
			init_proxy: fromProxy,
		};
	}

	post(
		message: Message,
		/**
		 * Specify a custom timeout for this message (in milliseconds)
		 */
		custom_timeout?: number
	): { messageID: id; answer: Promise<Answer> } {
		const proxy = this.proxyfy(message);
		this.ignoreThoseProxies.push(proxy.id);

		this.window.postMessage(proxy);
		const timeout = custom_timeout || this.options.answerTimeout || 15_000;
		this.debug(
			"Proxified message posted:",
			proxy,
			"(answer timeout :",
			timeout / 100,
			"seconds)."
		);

		const answer: ReturnType<typeof this.post>["answer"] = Promise.race([
			new Promise<Answer>((res) => {
				this.responders.push({
					proxyID: proxy.id,
					promiseResponder: res,
				});
			}),
			new Promise<never>((_, rej) => {
				setTimeout(() => rej("Response timeout reached."), timeout);
			}),
		]);

		return {
			messageID: proxy.id,
			answer,
		};
	}
	onReceive(handler: Handler<Message, Answer>): id {
		const handler_proxy: (typeof this.handlers)[number] = {
			id: this.generateID(),
			handler,
		};
		this.handlers.push(handler_proxy);

		this.debug("New handler has been registered:", handler_proxy);
		return handler_proxy.id;
	}
	removeHandler(id: id): boolean {
		const index = this.handlers.findIndex((proxy) => proxy.id === id);
		if (index < 0) return false;
		this.handlers.splice(index, 1);

		this.debug("Handler <", id, "> has been deleted.");
		return true;
	}
}
