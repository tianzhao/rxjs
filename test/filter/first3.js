
const source = from([1, 2, 3, 4, 5]);
//no value will pass, emit default
const example = source.pipe(first(val => val > 5, 'Nothing'));
//output: 'Nothing'
const subscribe = example.subscribe(val => console.log(val));

