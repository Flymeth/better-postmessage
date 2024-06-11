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
        var _a;
        this.window = window;
        this.handlers = [];
        this.responders = [];
        this.ignoreThoseProxies = [];
        if ((_a = options === null || options === void 0 ? void 0 : options.tunnel) === null || _a === void 0 ? void 0 : _a.includes(":"))
            throw new Error("Invalid tunnel name (note that tunnel cannot contain the character ':').");
        this.options = options || {};
        window.addEventListener("message", ({ data }) => {
            if (typeof data === "object" &&
                "__BETTER_POST_MESSAGE" in data &&
                data.__BETTER_POST_MESSAGE)
                this.messageReceived(data);
        });
        this.debug("Instance created. TUNNEL =", (options === null || options === void 0 ? void 0 : options.tunnel) || "<GLOBAL>");
    }
    debug(...message) {
        if (!this.options.debug)
            return;
        console.debug(`[BetterPostMessage${this.options.tunnel ? ` - ${this.options.tunnel}` : ""}]>`, ...message);
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
        if (this.options.tunnel &&
            proxy.tunnel &&
            this.options.tunnel !== proxy.tunnel)
            return this.debug(`Blocked proxy from tunnel ${proxy.tunnel} because it doesn't match this tunnel (${this.options.tunnel}).`);
        if (this.isAnswer(proxy)) {
            const responders = this.responders.filter((resp) => resp.proxyID === proxy.init_proxy);
            if (responders.length) {
                this.debug("Received answer <", proxy.id, "> from proxy <", proxy.init_proxy, ">.", responders.length, "message promises will be resolved. Answer content: ", proxy.data);
                this.deleteResponders(proxy.init_proxy);
                responders.forEach((r) => r.promiseResponder(proxy.data));
            }
            else
                this.debug("Answer message received but no responders found for it.", proxy, this.responders);
        }
        else {
            this.debug("Received message from proxy <", proxy.id, ">.", this.handlers.length, "handlers will be triggered. Message content: ", proxy.data);
            this.handlers.forEach(({ handler, id: handlerID }) => __awaiter(this, void 0, void 0, function* () {
                const answer = yield handler(proxy.data);
                if (typeof answer === "undefined")
                    return;
                const answerProxy = this.proxyfy(answer, undefined, proxy.id);
                this.window.postMessage(answerProxy);
                this.debug("Handler <", handlerID, "> has answered to the message <", proxy.id, "> with content :", answer);
            }));
        }
    }
    deleteResponders(proxyID) {
        this.responders = this.responders.filter((resp) => resp.proxyID !== proxyID);
        this.debug("Deleted all responders for proxy <", proxyID, ">.");
    }
    generateID() {
        const { tunnel } = this.options;
        return ((tunnel ? `${tunnel}::` : "") +
            `${Date.now()}-${Math.floor(Math.random() * 1000)}`);
    }
    proxyfy(data, id, fromProxy) {
        return {
            __BETTER_POST_MESSAGE: true,
            id: id || this.generateID(),
            data,
            tunnel: this.options.tunnel,
            init_proxy: fromProxy,
        };
    }
    post(message, custom_timeout) {
        const proxy = this.proxyfy(message);
        this.ignoreThoseProxies.push(proxy.id);
        this.window.postMessage(proxy);
        const timeout = custom_timeout || this.options.answerTimeout || 15000;
        this.debug("Proxified message posted:", proxy, "(answer timeout :", timeout / 100, "seconds).");
        const answer = Promise.race([
            new Promise((res) => {
                this.responders.push({
                    proxyID: proxy.id,
                    promiseResponder: res,
                });
            }),
            new Promise((_, rej) => {
                setTimeout(() => rej("Response timeout reached."), timeout);
            }),
        ]);
        return {
            messageID: proxy.id,
            answer,
        };
    }
    onReceive(handler) {
        const handler_proxy = {
            id: this.generateID(),
            handler,
        };
        this.handlers.push(handler_proxy);
        this.debug("New handler has been registered:", handler_proxy);
        return handler_proxy.id;
    }
    removeHandler(id) {
        const index = this.handlers.findIndex((proxy) => proxy.id === id);
        if (index < 0)
            return false;
        this.handlers.splice(index, 1);
        this.debug("Handler <", id, "> has been deleted.");
        return true;
    }
}
exports.default = BetterPostMessage;
