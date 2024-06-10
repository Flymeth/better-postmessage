"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
class BetterPostMessage {
    constructor(window, options) {
        this.window = window;
        this.handlers = [];
        this.responders = [];
        this.ignoreThoseProxies = [];
        this.options = options || {};
        window.addEventListener("message", ({ data }) => {
            this.debug("Window message received : ", data);
            if (typeof data === "object" &&
                "__BETTER_POST_MESSAGE" in data &&
                data.__BETTER_POST_MESSAGE)
                this.messageReceived(data);
        });
        this.debug("Instance created. NAME =", options === null || options === void 0 ? void 0 : options.name);
    }
    debug(...message) {
        if (!this.options.debug)
            return;
        console.debug(`[BetterPostMessage${this.options.name ? ` - ${this.options.name}` : ""}]>`, ...message);
    }
    isAnswer(proxy) {
        return !!("init_proxy" in proxy && proxy.init_proxy);
    }
    messageReceived(proxy) {
        const ignoredIndex = this.ignoreThoseProxies.indexOf(proxy.id);
        if (ignoredIndex >= 0) {
            this.ignoreThoseProxies.splice(ignoredIndex, 1);
            return;
        }
        if (this.isAnswer(proxy)) {
            const responders = this.responders.filter((resp) => resp.proxyID === proxy.init_proxy);
            if (responders.length) {
                this.debug("Received answer<", proxy.id, "> from message proxy <", proxy.init_proxy, ">.", responders.length, "handlers will be resolved. Answer content: ", proxy.data);
                this.deleteResponders(proxy.init_proxy);
                responders.forEach((r) => r.promiseResponder(proxy.data));
            }
            else
                this.debug("Answer message received but no responders found for it.", proxy, this.responders);
        }
        else {
            this.debug("Received message from message proxy <", proxy.id, ">.", this.handlers.length, "handlers will be triggered. Message content: ", proxy.data);
            this.handlers.forEach(({ handler, id: handlerID }) => __awaiter(this, void 0, void 0, function* () {
                const answer = yield handler(proxy.data);
                if (typeof answer === "undefined")
                    return;
                const answerProxy = this.proxyfy(answer, undefined, proxy.id);
                this.window.postMessage(answerProxy);
                this.debug("Handler <", handlerID, "> has answered to the message <", proxy.id, ">. The message answer have just been sent. Answer :", answer);
            }));
        }
    }
    deleteResponders(proxyID) {
        this.responders = this.responders.filter((resp) => resp.proxyID !== proxyID);
        this.debug("Deleted all responders for proxy <", proxyID, ">.");
    }
    generateID() {
        var _a;
        const name = (_a = this.options) === null || _a === void 0 ? void 0 : _a.name;
        return ((name ? `${name}_` : "") +
            `${Date.now()}-${Math.floor(Math.random() * 1000)}`);
    }
    proxyfy(data, id, fromProxy) {
        const base = {
            __BETTER_POST_MESSAGE: true,
            id: id || this.generateID(),
            data,
        };
        return fromProxy
            ? Object.assign(Object.assign({}, base), { init_proxy: fromProxy }) : base;
    }
    post(message) {
        const proxy = this.proxyfy(message);
        this.ignoreThoseProxies.push(proxy.id);
        this.window.postMessage(proxy);
        this.debug("Proxified message posted:", proxy);
        const answer = Promise.race([
            new Promise((res) => {
                this.responders.push({
                    proxyID: proxy.id,
                    promiseResponder: res,
                });
            }),
            new Promise((_, rej) => {
                setTimeout(() => rej("Response timeout reached."), this.options.answerTimeout || 15000);
            }),
        ]);
        return {
            messageID: proxy.id,
            get answer() {
                return answer;
            },
        };
    }
    onReceive(handler) {
        const proxy = {
            id: this.generateID(),
            handler,
        };
        this.handlers.push(proxy);
        this.debug("New handler has been registed:", proxy);
        return proxy.id;
    }
    removeHandler(id) {
        const index = this.handlers.findIndex((proxy) => proxy.id === id);
        if (index < 0)
            return false;
        this.handlers.splice(index, 1);
        this.debug("Handler with id: <", id, "> has been deleted.");
        return true;
    }
}
exports.default = BetterPostMessage;
