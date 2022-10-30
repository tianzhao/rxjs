
//emit value every 1 second
const oneSecondInterval = interval(1000);
//return an observable that emits value every 5 seconds
const fiveSecondInterval = () => interval(5000);
//every five seconds, emit buffered values
const bufferWhenExample = oneSecondInterval.pipe(
  bufferWhen(fiveSecondInterval)
);
//log values
//ex. output: [0,1,2,3]...[4,5,6,7,8]
const subscribe = bufferWhenExample.subscribe(val =>
  console.log('Emitted Buffer: ', val)
);

