
const source = of(1, 2, 3, 4, 5);

// tap also accepts an object map to log next, error, and complete
const example = source
  .pipe(
    map(val => val + 10),
    tap({
      next: val => {
        // on next 11, etc.
        console.log('on next', val);
      },
      error: error => {
        console.log('on error', error.message);
      },
      complete: () => console.log('on complete')
    })
  )
  // output: 11, 12, 13, 14, 15
  .subscribe(val => console.log(val));

