
const source = from([1, 2, 3, 4, 5, 6]);
//first value is true, second false
const [evens, odds] = partition(source, val => val % 2 === 0);
/*
  Output:
  "Even: 2"
  "Even: 4"
  "Even: 6"
  "Odd: 1"
  "Odd: 3"
  "Odd: 5"
*/
const subscribe = merge(
  evens.pipe(map(val => `Even: ${val}`)),
  odds.pipe(map(val => `Odd: ${val}`))
).subscribe(val => console.log(val));

