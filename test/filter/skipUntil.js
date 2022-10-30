
//emit every 1s
const source = interval(1000);
//skip emitted values from source until inner observable emits (6s)
const example = source.pipe(skipUntil(timer(6000)));
//output: 5...6...7...8........
const subscribe = example.subscribe(val => console.log(val));

