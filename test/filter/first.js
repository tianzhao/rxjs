
const source = from([1, 2, 3, 4, 5]);
//no arguments, emit first value
const example = source.pipe(first());
//output: "First value: 1"
const subscribe = example.subscribe(val => console.log(`First value: ${val}`));

