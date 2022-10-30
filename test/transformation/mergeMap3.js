
// helper to create promise
const myPromise = val =>
  new Promise(resolve => resolve(`${val} World From Promise!`));

// emit 'Hello'
const source$ = of('Hello');

// map to promise and emit result
source$
  .pipe(mergeMap(val => myPromise(val)))
  // output: 'Hello World From Promise'
  .subscribe(val => console.log(val));

