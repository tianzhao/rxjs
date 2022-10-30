
//Create an observable that emits a value every second
const myInterval = interval(1000);
//Create an observable that emits every time document is clicked
const bufferBy = fromEvent(document, 'click');
/*
Collect all values emitted by our interval observable until we click document. This will cause the bufferBy Observable to emit a value, satisfying the buffer. Pass us all collected values since last buffer as an array.
*/
const myBufferedInterval = myInterval.pipe(buffer(bufferBy));
//Print values to console
//ex. output: [1,2,3] ... [4,5,6,7,8]
const subscribe = myBufferedInterval.subscribe(val =>
  console.log(' Buffered Values:', val)
);

