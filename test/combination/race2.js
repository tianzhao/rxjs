//Throws an error and ignores the other observables.
const _first = of('first').pipe(
  delay(100),
  map(_ => {
    throw 'error';
  })
);
const second = of('second').pipe(delay(200));
const third = of('third').pipe(delay(300));
// nothing logged
race(_first, second, third).subscribe(val => console.log(val));

