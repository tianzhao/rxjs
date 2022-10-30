
//emit 'Hello' and 'Goodbye'
const source = of('Hello', 'Goodbye');
//example with promise
const examplePromise = val => new Promise(resolve => resolve(`${val} World!`));
// map value from source into inner observable, when complete emit result and move to next
const example = source.pipe(concatMap(val => examplePromise(val)));
//output: 'Example w/ Promise: 'Hello World', Example w/ Promise: 'Goodbye World'
const subscribe = example.subscribe(val =>
  console.log('Example w/ Promise:', val)
);

