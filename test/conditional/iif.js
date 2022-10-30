const r$ = of('R');
const x$ = of('X');

interval(1000)
  .pipe(mergeMap(v => iif(() => v % 4 === 0, r$, x$)))
  .subscribe(console.log);

// output: R, X, X, X, R, X, X, X, etc...

