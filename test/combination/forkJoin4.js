/*
  If any inner observables error, the error result
  will be emitted by catchError.
*/
const example = forkJoin({
  // emit 'Hello' immediately
  sourceOne: of('Hello'),
  // emit 'World' after 1 second
  sourceTwo: of('World').pipe(delay(1000)),
  // throw error
  sourceThree: throwError('This will error')
}).pipe(catchError(error => of(error)));

// output: 'This will Error'
const subscribe = example.subscribe(val => console.log(val));
