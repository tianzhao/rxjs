
//emit immediately then every 1s
const source = timer(0, 1000);
const example = source.pipe(
  //start new window every 3s
  windowTime(3000),
  tap(_ => console.log('NEW WINDOW!'))
);

const subscribeTwo = example
  .pipe(
    //window emits nested observable
    mergeAll()
    /*
            output:
            "NEW WINDOW!"
            0
            1
            2
            "NEW WINDOW!"
            3
            4
            5
          */
  )
  .subscribe(val => console.log(val));

