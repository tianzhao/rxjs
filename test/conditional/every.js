//emit 5 values
const source = of(1, 2, 3, 4, 5);
const example = source.pipe(
  //is every value even?
  every(val => val % 2 === 0)
);
//output: false
const subscribe = example.subscribe(val => console.log(val));

