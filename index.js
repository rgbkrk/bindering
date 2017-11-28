const { binder } = require("rx-binder");

const { kernels } = require("rx-jupyter");

const { filter, map, switchMap, tap } = require("rxjs/operators");

const uuid = require("uuid");

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
        if (msg.phase === "building") {
          console.log(msg.message);
        } else {
          console.log(msg);
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
  const kernel = await kernelMe(serverConfig);

  var sub = kernel.channels.subscribe(
    x => console.log("kernel message", x),
    err => console.error("kernel error", err),
    () => console.log("kernel complete!")
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

  console.log(
    "sleeping for a second, though we really just need to wait for status: idle"
  );

  await sleep(60);

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

  console.log("Sleeping, mostly just for fun");
  await sleep(60);

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

  console.log("Sleeping, mostly just for fun");
  await sleep(60);

  kernel.channels.complete();

  console.log("Killing kernel");
  kernels.kill(serverConfig, kernel.id);
}

module.exports = {
  kernelMe,
  serverMe,
  main
};
