
//emit every second
const source = interval(100);
//filter out all values until interval is greater than 5
const example = source.pipe(filter(num => num > 5));
/*
  "Number greater than 5: 6"
  "Number greater than 5: 7"
  "Number greater than 5: 8"
  "Number greater than 5: 9"
*/
const subscribe = example.subscribe(val =>
  console.log(`Number greater than 5: ${val}`)
);

/*#{
let seq = Array(24).fill().map((_, i) => i + 6);
g.subscription(subscribe, seq.map(g.next));
setTimeout(() => subscribe.unsubscribe(), 3000);
}#*/
