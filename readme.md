# Better postMessage

Tired of the `window.postMessage()` method ? Need fresh new API that support Promises, answers and simple typed handling ?
BetterPostMessage will resolve all of that !

## Installation

```terminal
# NPM
npm i --save better-postmessage

# YARN
yarn i --save better-postmessage

# BUN
bun i --save better-postmessage
```

## Usage

### First context

```ts
import BetterPostMessage from "better-postmessage";

const messenger = new BetterPostMessage<string>(window);
messenger
 .post({ message: "ping" })
 .answer.then((answer) => {
  if (answer === "pong") console.log("Second context is online !");
 })
 .catch(() => {
  console.log("Second context has not responded");
 });
```

### Second context

```ts
import BetterPostMessage from "better-postmessage";

const messenger = new BetterPostMessage<string>(window);
messenger.onReceive(({ message }) => {
 if (message === "ping") return "pong";
});
```

### Parameters

#### Constructor arguments

```js
new BetterPostMessage(context, options?)
```

##### Context

The Window-based context where to emit/receive messages

##### Options?

> Not required

The object containing all behavior options of the messenger.
Here are the different options :

KEY | DESCRIPTION | TYPE | DEFAULT VALUE
--|--|--|--
name | The messenger name | `string` | `""`
answerTimeout | In milliseconds, the maximum amount of time a message can wait for its answer | `number` | `15_000`
debug | If you want to view what's appening behind the process | `boolean` | `false`
