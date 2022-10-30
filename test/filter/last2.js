
const source = from([1, 2, 3, 4, 5]);
//emit last even number
const exampleTwo = source.pipe(last(num => num % 2 === 0));
//output: "Last to pass test: 4"
const subscribeTwo = exampleTwo.subscribe(val =>
  console.log(`Last to pass test: ${val}`)
);

