
const firstInterval = interval(1000).pipe(take(10));
const secondInterval = interval(1000).pipe(take(2));

const exhaustSub = firstInterval
  .pipe(
    exhaustMap(f => {
      console.log(`Emission Corrected of first interval: ${f}`);
      return secondInterval;
    })
  )
  /*
                When we subscribed to the first interval, it starts to emit a values (starting 0).
                This value is mapped to the second interval which then begins to emit (starting 0).  
                While the second interval is active, values from the first interval are ignored.
                We can see this when firstInterval emits number 3,6, and so on...

                  Output:
                  Emission of first interval: 0
                  0
                  1
                  Emission of first interval: 3
                  0
                  1
                  Emission of first interval: 6
                  0
                  1
                  Emission of first interval: 9
                  0
                  1
              */
  .subscribe(s => console.log(s));

