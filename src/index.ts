interface Options {
	name?: string;
	/**
	 * In milliseconds, the maximum amount of time a message can wait for its answer.
	 * @default {15_000}
	 */
	answerTimeout?: number;
	debug?: boolean;
}
type id = `${`${string}_` | ""}${number}-${number}`;
type ProxyMessage<M, A = M> = {
	__BETTER_POST_MESSAGE: true;
	id: id;
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
	readonly options: Options;

	constructor(private window: Window, options?: Options) {
		this.options = options || {};

		window.addEventListener("message", ({ data }) => {
			this.debug("Window message received : ", data);
			if (
				typeof data === "object" &&
				"__BETTER_POST_MESSAGE" in data &&
				data.__BETTER_POST_MESSAGE
			)
				this.messageReceived(data as ProxyMessage<Message, Answer>);
		});
		this.debug("Instance created. NAME =", options?.name);
	}

	private debug(...message: any[]) {
		if (!this.options.debug) return;
		console.debug(
			`[BetterPostMessage${
				this.options.name ? ` - ${this.options.name}` : ""
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

		if (this.isAnswer(proxy)) {
			const responders = this.responders.filter(
				(resp) => resp.proxyID === proxy.init_proxy
			);
			if (responders.length) {
				this.debug(
					"Received answer<",
					proxy.id,
					"> from message proxy <",
					proxy.init_proxy,
					">.",
					responders.length,
					"handlers will be resolved. Answer content: ",
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
				"Received message from message proxy <",
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
					">. The message answer have just been sent. Answer :",
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
		const name = this.options?.name;
		return ((name ? `${name}_` : "") +
			`${Date.now()}-${Math.floor(Math.random() * 1000)}`) as id;
	}
	private proxyfy<D extends Message | Answer>(
		data: D,
		id?: id,
		fromProxy?: id
	): ProxyMessage<D> {
		const base: ProxyMessage<D> = {
			__BETTER_POST_MESSAGE: true,
			id: id || this.generateID(),
			data,
		};

		return fromProxy
			? {
					...base,
					init_proxy: fromProxy,
			  }
			: base;
	}

	post(message: Message): { messageID: id; answer: Promise<Answer> } {
		const proxy = this.proxyfy(message);
		this.ignoreThoseProxies.push(proxy.id);

		this.window.postMessage(proxy);
		this.debug("Proxified message posted:", proxy);

		const answer: ReturnType<typeof this.post>["answer"] = Promise.race([
			new Promise<Answer>((res) => {
				this.responders.push({
					proxyID: proxy.id,
					promiseResponder: res,
				});
			}),
			new Promise<never>((_, rej) => {
				setTimeout(
					() => rej("Response timeout reached."),
					this.options.answerTimeout || 15_000
				);
			}),
		]);

		return {
			messageID: proxy.id,
			get answer() {
				return answer;
			},
		};
	}
	onReceive(handler: Handler<Message, Answer>): id {
		const proxy: (typeof this.handlers)[number] = {
			id: this.generateID(),
			handler,
		};
		this.handlers.push(proxy);

		this.debug("New handler has been registed:", proxy);
		return proxy.id;
	}
	removeHandler(id: id): boolean {
		const index = this.handlers.findIndex((proxy) => proxy.id === id);
		if (index < 0) return false;
		this.handlers.splice(index, 1);

		this.debug("Handler with id: <", id, "> has been deleted.");
		return true;
	}
}
