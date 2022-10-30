//emit every 2.5 seconds
const _first = interval(2500);
//emit every 1 second
const second = interval(1000);
//used as instance method
const example = _first.pipe(_merge(second));
//output: 0,1,0,2....
const subscribe = example.subscribe(val => console.log(val));

