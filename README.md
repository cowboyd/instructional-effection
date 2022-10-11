# Instructional Effection

Effection based on the idea that there are three primitive "instructions"

- resource
- action
- suspend

This allows us to express all operations as a composition of these three
primitives, which means that all operation results are consumed using `yield*`
instead of `yield` This is good because it is

1. as friendly with TypeScript as `await`
2. task trees are very shallow. Only as deep as the primitives needed
3. `Task` api has only a single method beyond `Promise`, whichh is `halt()`
4. tasks do not have a reference to themselves, so cannot be self-halting.
