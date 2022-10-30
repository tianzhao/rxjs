//create and resolve basic promise
const samplePromise = val => new Promise(resolve => resolve(val));
//emit a value every 2 seconds
const source = interval(2000);

const example = source.pipe(
  map(val => samplePromise(val)),
  //merge values from resolved promise
  concatAll()
);
//output: 'Example with Promise 0', 'Example with Promise 1'...
const subscribe = example.subscribe(val =>
  console.log('Example with Promise:', val)
);
