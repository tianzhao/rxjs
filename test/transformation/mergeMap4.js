
// helper to create promise
const myPromise = val =>
  new Promise(resolve => resolve(`${val} World From Promise!`));

// emit 'Hello'
const source$ = of('Hello');

source$
  .pipe(
    mergeMap(
      val => myPromise(val),
      /*
      you can also supply a second argument which receives the source value and emitted
      value of inner observable or promise
    */
      (valueFromSource, valueFromPromise) => {
        return `Source: ${valueFromSource}, Promise: ${valueFromPromise}`;
      }
    )
  )
  // output: "Source: Hello, Promise: Hello World From Promise!"
  .subscribe(val => console.log(val));

