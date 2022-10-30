//Returns: [0,1], [1,2], [2,3], [3,4], [4,5]
interval(1000)
  .pipe(pairwise(), take(5))
  .subscribe(console.log);

