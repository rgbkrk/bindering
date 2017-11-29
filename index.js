/**
 * This repo is just me tinkering with the rx-binder and rx-jupyter interfaces
 * to see how easy they are to work with (at least for an Rx user).
 *
 * Some major TODO for readability:
 *  - Use primitive messages and message creators from @nteract/messaging
 *  - Create a simplified way of wrapping next + subscription
 */

const { binder } = require("rx-binder");
const { kernels } = require("rx-jupyter");

const {
  filter,
  map,
  switchMap,
  tap,
  first,
  timeout,
  catchError
} = require("rxjs/operators");

const { empty } = require("rxjs/observable/empty");

const { omit } = require("lodash");
const uuid = require("uuid");
const chalk = require("chalk");
const jsome = require("jsome");

/** Forced polyfills for node **/
const { XMLHttpRequest } = require("xmlhttprequest");
const WebSocket = require("ws");
global.XMLHttpRequest = XMLHttpRequest;
global.WebSocket = WebSocket;

async function sleep(t = 1000) {
  return new Promise(resolve => setTimeout(resolve, t));
}

async function serverMe(repo = "jupyterlab/jupyterlab") {
  return binder({ repo })
    .pipe(
      tap(msg => {
        // We use this as a side-effectful logger just as part of this app
        // In a real UI, you'd want all these messages to get dispatch to the
        // proper store / state tree
        if (msg.phase === "building") {
          console.log(msg.message);
        } else {
          console.log(chalk.blue.bold(`** Binder -- ${msg.phase} **`));
          jsome(msg);
        }
      }),
      filter(msg => msg.phase === "ready"),
      map(msg => {
        const serverConfig = {
          endpoint: msg.url.replace(/\/\s*$/, ""),
          uri: "/",
          token: msg.token
        };
        return serverConfig;
      })
    )
    .toPromise();
}

async function kernelMe(serverConfig, kernelName = "python3") {
  const session = uuid();

  return kernels
    .start(serverConfig, kernelName, "")
    .pipe(
      map(aj => {
        return Object.assign({}, aj.response, {
          session: session,
          channels: kernels.connect(serverConfig, aj.response.id, session)
        });
      })
    )
    .toPromise();
}

async function main() {
  const serverConfig = await serverMe("nteract/vdom");

  console.log(chalk.blue.bold("** Launched server **"));
  jsome(serverConfig);

  const kernel = await kernelMe(serverConfig);

  console.log(chalk.blue.bold("** Launched kernel **"));
  jsome(omit(kernel, ["channels"]));

  var sub = kernel.channels.subscribe(
    x => jsome(x),
    err => {
      console.error(chalk.red("*** Kernel connection error ***"));
      jsome(err);
    },
    () => console.log(chalk.blue.bold("** Kernel connection closed! **"))
  );

  kernel.channels.next(
    JSON.stringify({
      header: {
        msg_id: uuid(),
        username: "username",
        session: kernel.session,
        date: new Date().toISOString(),
        msg_type: "kernel_info_request",
        version: "5.2"
      },
      channel: "shell",
      parent_header: {},
      metadata: {},
      content: {},
      buffers: []
    })
  );

  await kernel.channels
    .pipe(filter(m => m.header.msg_type === "status"), first())
    .toPromise();

  const kernelInfoRequest = {
    header: {
      msg_id: uuid(),
      username: "username",
      session: kernel.session,
      date: new Date().toISOString(),
      msg_type: "kernel_info_request",
      version: "5.2"
    },
    channel: "shell",
    parent_header: {},
    metadata: {},
    content: {},
    buffers: []
  };

  // Prep our handler for the kernel info reply
  const kr = kernel.channels
    .pipe(
      filter(m => m.parent_header.msg_id === kernelInfoRequest.header.msg_id),
      filter(m => m.header.msg_type === "kernel_info_reply"),
      first()
    )
    .toPromise();

  kernel.channels.next(JSON.stringify(kernelInfoRequest));

  // Wait for the kernel info reply
  await kr;

  const executeRequest = {
    header: {
      msg_id: uuid(),
      username: "username",
      session: kernel.session,
      date: new Date().toISOString(),
      msg_type: "execute_request",
      version: "5.2"
    },
    channel: "shell",
    parent_header: {},
    metadata: {},
    content: {
      code: "from vdom import h1\nh1('Woo')",
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: false
    },
    buffers: []
  };

  const p = kernel.channels
    .pipe(
      filter(m => m.parent_header.msg_id === executeRequest.header.msg_id),
      filter(m => m.header.msg_type === "status"),
      filter(m => m.content.execution_state === "idle"),
      first()
    )
    .toPromise();

  kernel.channels.next(JSON.stringify(executeRequest));

  await p;

  // Prep our handler for the kernel info reply
  const ks = kernel.channels
    .pipe(
      filter(m => m.header.msg_type === "shutdown_reply"),
      first(),
      timeout(100),
      catchError(() => empty())
    )
    .toPromise();

  kernel.channels.next(
    JSON.stringify({
      header: {
        msg_id: uuid(),
        username: "username",
        session: kernel.session,
        date: new Date().toISOString(),
        msg_type: "shutdown_request",
        version: "5.2"
      },
      channel: "shell",
      parent_header: {},
      metadata: {},
      content: {},
      buffers: []
    })
  );

  await ks;

  kernel.channels.complete();

  console.log(chalk.blue.bold("** Killing kernel just to make it official **"));
  kernels.kill(serverConfig, kernel.id);
}

module.exports = {
  kernelMe,
  serverMe,
  main
};
