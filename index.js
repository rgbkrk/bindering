const { binder } = require("rx-binder");

const { kernels } = require("rx-jupyter");
const { filter, map, switchMap, tap } = require("rxjs/operators");

const EventSource = require("eventsource");
const { XMLHttpRequest } = require("xmlhttprequest");

global.XMLHttpRequest = XMLHttpRequest;

connection = kernels.connect(x.serverConfig, x.kernel.response.id);

function kernelMe(kernelName = "python3") {
  return binder({ repo: "jupyterlab/jupyterlab" }, EventSource).pipe(
    tap(msg => console.log(msg)),
    filter(m => m.phase === "ready"),
    map(msg => {
      const serverConfig = {
        endpoint: msg.url.replace(/\/\s*$/, ""),
        uri: "/",
        token: msg.token
      };
      return serverConfig;
    }),
    switchMap(serverConfig => {
      return kernels.start(serverConfig, kernelName, "").pipe(
        map(aj => {
          return {
            serverConfig,
            kernel: aj.response,
            kernelConnection: kernels.connect(serverConfig, aj.response.id)
          };
        })
      );
    })
  );
}

module.exports = {
  kernelMe
};
