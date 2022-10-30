// when source never completes, any subsequent observables never run
concat(interval(1000), of('This', 'Never', 'Runs'))
  // log: 1,2,3,4.....
  .subscribe(console.log);
