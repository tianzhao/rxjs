
//emit value every 2 seconds
const sampleInterval = interval(500).pipe(take(5));
const fakeRequest = of('Network request complete').pipe(delay(3000));
//wait for first to complete before next is subscribed
const example = sampleInterval.pipe(concatMapTo(fakeRequest));
//result
//output: Network request complete...3s...Network request complete'
const subscribe = example.subscribe(val => console.log(val));

