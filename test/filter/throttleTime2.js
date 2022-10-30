
const source = interval(1000);
/*
  emit the first value, then ignore for 5 seconds. repeat...
*/
const example = source.pipe(
  throttleTime(5000, { trailing: true })
);
// output: 5...11...17
const subscribe = example.subscribe(val => console.log(val));
