
const source$ = of(1, 2, 3, 9);

source$
  // with inclusive flag, the value causing the predicate to return false will also be emitted
  .pipe(takeWhile(val => val <= 3, true))
  // log: 1, 2, 3, 9
  .subscribe(console.log);

