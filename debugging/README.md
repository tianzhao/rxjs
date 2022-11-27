Stack trace
===========
When an error occurs, we capture the error value and filter the stack trace to
show only the call stack on the user code and the `rxjs` operator being
applied. The internal `rxjs` implementation stack traces are removed and
replaced with just the location of where the operator is used in the user code
so they can be tracked down more easily.
The filtered stack trace can be accessed from the `.stack` field on the error
value.

An example in [stack.html](stack.html):
```javascript
function f(x) { return x.bad; }
of(1).switchMap(x => f()).subscribe(x => x, e => {
  console.log(e.stack)
  console.log(e.rxGraphTrace)
})
```

`x` is `undefined` in `f` and will throw an exception when it tries to access
a property on an undefined value. The error handler will print the stack trace
and part of the subscription graph where the error occurs tracing back to its
sources:
```
TypeError: Cannot read properties of undefined (reading 'bad')
    at f (stack.html:12:26)
    at <anonymous> (stack.html:15:22)
    at stack.html:15:7
['fmap', 'of']
```


Runtime invariant
=================
The example safety rules based on the semantics is implemented in
[safe.js](safe.js). It is implemented as a function `safe`. For usage, apply the
function on a subscription object
```javascript
let sub = of(1,2,3).map(x => x * 2).subscribe();
let result = safe(sub)
console.log(result)
```

or apply it to all subscriptions by invoking the function without any arguments.
See [safe.html](safe.html) for more examples.

