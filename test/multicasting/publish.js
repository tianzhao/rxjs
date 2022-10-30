
//emit value every 1 second
const source = interval(1000);
//do nothing until connect() is called
const example = publish()(source.pipe(
  //side effects will be executed once
  tap(_ => console.log('Do Something!')),
));

/*
  source will not emit values until connect() is called
  output: (after 5s)
  "Do Something!"
  "Subscriber One: 0"
  "Subscriber Two: 0"
  "Do Something!"
  "Subscriber One: 1"
  "Subscriber Two: 1"
*/
const subscribe = example.subscribe(val =>
  console.log(`Subscriber One: ${val}`)
);
const subscribeTwo = example.subscribe(val =>
  console.log(`Subscriber Two: ${val}`)
);

//call connect after 5 seconds, causing source to begin emitting items
setTimeout(() => {
  example.connect();
}, 5000);

