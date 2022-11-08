Stack trace
===========
When an error occurs, we capture the error value and filter the stack trace to
show only the call stack on the user code and the `rxjs` operator being
applied. The internal `rxjs` implementation stack traces are removed and
replaced with just the location of where the operator is used in the user code
so they can be tracked down more easily.
The filtered stack trace can be accessed from the `.stack` field on the error
value.

```javascript
function f(x) { return x.bad; }
of(1).switchMap(x => f()).subscribe(x => x, e => console.log(e.stack))
```

Runtime invariant
=================
The example safety rules based on the semantics is implemented in
[safe](safe.js). It is implemented as a function `safe`. For usage, apply the
function on a subscription object
```javascript
let sub = of(1,2,3).map(x => x * 2).subscribe();
let result = safe()
console.log(result)
```

or apply it to all subscriptions invoking the function without any arguments.
See [safe.html](safe.html) for more examples.

