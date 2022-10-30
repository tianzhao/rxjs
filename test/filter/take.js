
//emit 1,2,3,4,5
const source = of(1, 2, 3, 4, 5);
//take the first emitted value then complete
const example = source.tap(console.log).pipe(take(1));
//output: 1
const subscribe = example.subscribe(val => console.log(val));
