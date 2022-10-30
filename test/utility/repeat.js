
const delayedThing = of('delayed value').pipe(delay(2000));

delayedThing
  .pipe(repeat(3))
  // delayed value...delayed value...delayed value
  .subscribe(console.log);

