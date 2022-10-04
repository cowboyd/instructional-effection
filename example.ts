import { log, run } from "./mod.ts";

run(function* () {
  yield* log("this is the first outer");
  yield* log("this is the second outer");
  yield* (function* () {
    log("this is the inner");
  })();
});

/*
  Structured logging use-cases.

  1. Just log anywhere, and don't worry about it crapping up your console. No
  more adding and removing log statements.
  2. Be able to have fine tuned control from the CLI on setting the log level
  - do we execute a query to stream the logs to console, or some other location?
  - want to start the process with a preset connection of log queries to where
  - log to things other than the console very easily
  3. We also want to be able to control the log from within the inspector, and
  enabled and disable certain streams.
  4. We want a reflective way from the inspector to know what kind of data is
  out of this stream, and how it should be viewed. From a structured logging
  perspective this means that we want
  - checkboxes showing the individual log levels and whethere they are selected
  or not, along with a default value. Whether to append/replace the value. Logs,
  for example, we would want to append with a default buffer size
  (and that could be configurable)

  Questions

  Q1: Does every log statement have a path?, is it just a stream of
  values against that path?
  A1: I think that there is a well know stream associated with the
  Task/Context called 'log', and each statement pushes a value onto that stream.

  Q2: How do we handle ordering of the logs. In other words, if I'm subscribed to
  _all_ logs, a pattern like "*", then how do I make sure that logs appear in
  the order in which they were invoked?
  A2: Maybe the real answer is that there a single global stream then that
  contains the path from which it was used. Different subscribers are This would allow all the usecases

  Q3: In the inspector, how do we both enable the subscription to the log at
  that particular point, and then also show that we want to render it down at
  that point without having a variable actually at that point because it's at
  the top of the tree? In other words, If I have tasks A->B->C and I indicate
  I want to show logging for A, then I want to show the logs for A, as well as
  everything under (A,B,C), but if I expand B then I want to show logging
  statements for B under A. Or, I may want to have a seprate checkbox which is
  like "include child logs", or even "exclude logs from C".

  A3: It seems clear that the UI must be a fully custom plugin, but what is
  critical is that it know about the existence of the log, and that it can be
  subscribed to.

  Q4: Do we have some sort of separate inspector operations that can be defined
  around an operation? Because that inspector operation is available at any
  `Task/Context`
  A4: Maybe? But not in the case of logs. maybe in the case of restart. E.g.:
*/

export function useBigtestServer() {
  return resource(function* () {
    let config = yield* useConfig();
    yield* useBundler(config);
    let proxy = yield* useProxyServer(config);
    yield* all([
      useAgentServer(config, proxy),
      useBrowserManager(config),
    ]);
    yield* suspend();
  });
}

export function spawn(operation) {
  return resource(function* () {
    try {
      yield* provide(value);
    } finally {
      //xyz...
    }
  });
}
/*
  Conclusions:
  1. every context must have an id
  2. every context should have a parent
  3. logging happens with appending the unique task id, and the UI can figure
  out where to put it


  Resource restart

  2. Again, this is an inspector operation issue, where at any resource node we
  want to just be able to restart it.
  3. In the context of an operation, restarting a resource should halt
  everything "downstream" of it. What this means is reserving a reference to all
  "upstream" resources, then unwinding the entire operation up to the resource
  we we were restarting, and re-running the operation, but returning the
  captured references to the point of their invocation.
  4. The ability to restart a resource should not be enabled while it is
  restarting

  Questions

  Q1: How can we customize the UI of the restart to, for example, put a reload
  icon?
  Q2: On a request to restart, how do we ensure that nothing can operate on
  this resource, or any downstream resources (because they will be halted)
  Q3: Is there a general way to handle resource actions? Edit one of the inputs?
*/
