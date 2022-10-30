
interval(100)
  .pipe(take(10), toArray())
  .subscribe(console.log);

// output: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

